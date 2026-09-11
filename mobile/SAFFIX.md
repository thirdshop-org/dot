# Fix #8 + #9 : Single-flight + listing SAF hors transaction

## Diagnostic

Bug #8 (pas de single-flight) + item perf « Walk SAF dans une transaction longue »
(FEEDBACK.md:44-52). La boucle `useSyncDevice` (30s, `syncMode:'full'` par défaut)
recouvre le `syncRoot` manuel ; sur gros dossier (>30s) les deux `withTransaction`
s'entrelacent → double INSERT sur l'index partiel unique `idx_folders_uri` /
`idx_files_uri` (migrations.ts:213-214) → `SQLITE_CONSTRAINT` → transaction
annulée → walk failed silencieux (index.tsx:103).

Aucun test n'existe pour `syncRoot` / `syncDevice`.

## Architecture cible

```
syncRoot(resourceId)
  ├─ pre-flight : getFolder()          (lecture rapide, hors garde)
  └─ enqueue(() => doSyncRoot(root))   (sérialisé)
       │
       ├─ Phase 1 : listing SAF        (hors transaction)
       │   listFoldersChunked()
       │   for each folder → listDirectory() + yieldToMainThread()
       │   → Map<uri, FileEntry[]>
       │
       └─ Phase 2 : writes DB          (withTransaction)
           for each folder → saveFolder()
           for each folder → saveFile() × n
           réconciliation → exists=0
           → SyncResult
```

## Fichiers à modifier

### 1. `services/db/client.ts` — `__setWithTransactionForTests`

`syncRoot` utilise `withTransaction` (client.ts:110) qui passe par `getDatabase()` →
expo-sqlite. Les tests Node n'ont pas expo-sqlite. Il faut pouvoir substituer la
transaction pour les tests, comme `__setDbForTests` le fait pour `getSession()`.

Ajouter une variable module-level et un setter :

```typescript
let withTransactionOverride: (<T>(work: () => Promise<T>) => Promise<T>) | null = null;

export function __setWithTransactionForTests(
  impl: (<T>(work: () => Promise<T>) => Promise<T>) | null,
): void {
  withTransactionOverride = impl;
}
```

Dans `withTransaction`, si override est défini, l'utiliser sinon chemin normal.

Impact : aucun en production (`override` reste `null`). Test-only.

### 2. `features/syncDevice.ts` — refonte en deux phases + single-flight

#### 2a. Single-flight guard (module-level)

```typescript
let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const p = chain.then(work, work);   // s'exécute après le précédent, même en cas d'erreur
  chain = p.catch(() => {});          // la chaîne absorbe les erreurs pour ne pas bloquer le suivant
  return p;
}
```

Comportement :
- `syncRoot(A)` enqueued → démarre immédiatement (chain = resolved)
- `syncDevice()` enqueued pendant que A tourne → attend la fin de A
- Si A échoue, B démarre quand même (`.then(work, work)`)
- Les erreurs de B remontent au caller de B, pas à la chaîne

#### 2b. Extraction `doSyncRoot` (privée)

Extraire la logique actuelle de `syncRoot` dans une fonction privée
`doSyncRoot(root: StoredFolder)` qui prend un folder déjà résolu.

#### 2c. Refonte de `doSyncRoot` en deux phases

Phase 1 — Listing SAF (hors transaction, I/O disque) :

```typescript
const folders = (
  await listFoldersChunked(root.uri!, { recursive: true, includeRoot: true })
).sort((a, b) => uriDepth(a.uri) - uriDepth(b.uri));

const fileEntries = new Map<string, FileEntry[]>();
let lastYield = Date.now();
for (const folder of folders) {
  if (!folder.uri) continue;
  if (Date.now() - lastYield >= 16) {
    lastYield = Date.now();
    await yieldToMainThread();
  }
  fileEntries.set(
    folder.uri,
    listDirectory(folder.uri).filter((e) => !e.isDirectory),
  );
}
```

Phase 2 — Writes DB (withTransaction, SQL pur) :

```typescript
return withTransaction(async () => {
  const seen = new Set<string>();
  const resourceIdByUri = new Map<string, string>();
  let files = 0;

  for (const folder of folders) {
    seen.add(folder.uri);
    const parentUri = dirname(folder.uri);
    const parentResourceId =
      folder.uri === root.uri ? null : (resourceIdByUri.get(parentUri) ?? root.resource_id);
    const saved = await saveFolder(
      { uri: folder.uri, name: folder.name, exists: folder.exists },
      { parentResourceId },
    );
    resourceIdByUri.set(folder.uri, saved.resource_id);
  }

  for (const folder of folders) {
    if (!folder.uri) continue;
    const entries = fileEntries.get(folder.uri) ?? [];
    for (const entry of entries) {
      seen.add(entry.uri);
      await saveFile(entry, resourceIdByUri.get(folder.uri)!);
      files++;
    }
  }

  let missing = 0;
  for (const folder of await getFolders()) {
    if (folder.uri && isChildOf(folder.uri, root.uri!) && folder.exists && !seen.has(folder.uri)) {
      await saveFolder(
        { uri: folder.uri, name: folder.name, exists: false, resource_id: folder.resource_id },
        { syncStatus: folder.syncStatus },
      );
      missing++;
    }
  }
  for (const file of await getFiles()) {
    if (file.uri && isChildOf(file.uri, root.uri!) && file.exists && !seen.has(file.uri)) {
      await saveFile(storedToEntry(file), file.folder_resource_id, {
        resource_id: file.resource_id,
        syncStatus: file.syncStatus,
      });
      missing++;
    }
  }

  return { rootUri: root.uri!, folders: folders.length, files, missing };
});
```

#### 2d. Refonte des exports

```typescript
export async function syncRoot(rootResourceId: string): Promise<SyncResult> {
  const root = await getFolder(rootResourceId);   // pre-flight, hors garde
  if (!root) throw new Error('unknown root folder');
  if (!root.uri) throw new Error(`root '${root.name}' has no physical uri`);
  return enqueue(() => doSyncRoot(root));          // sérialisé
}

export async function syncDevice(): Promise<SyncResult[]> {
  return enqueue(async () => {                     // un seul enqueue pour tout le batch
    const roots = (await getFolders()).filter(
      (folder) => folder.parent_resource_id === null && folder.uri !== null,
    );
    const results: SyncResult[] = [];
    for (const root of roots) {
      results.push(await doSyncRoot(root));         // pas de double enqueue
    }
    await checkpointDatabase();
    return results;
  });
}
```

`useSyncDevice` : inchangée. Elle appelle `syncDevice()` qui passe par `enqueue`.

### 3. `tests/syncDevice.test.ts` — nouveau fichier

Harness : combinaison des patterns existants :
- `createHarness()` + `__setDbForTests(h)` (de repositories.test.ts)
- `__setWithTransactionForTests(async (work) => work())` (nouveau, simule sans BEGIN/COMMIT)
- `__setSafWalkForTests({ list, info })` (de safWalk.test.ts)

Arbre SAF de test :

```typescript
const tree: Record<string, DirectoryEntry[]> = {
  '/root': [dir('/root/a'), dir('/root/b'), file('/root/f1.txt')],
  '/root/a': [dir('/root/a/x'), file('/root/a/f2.txt')],
  '/root/a/x': [],
  '/root/b': [file('/root/b/f3.txt')],
};
```

Tests :

| # | Test | Vérifie |
|---|------|---------|
| 1 | Walk complet sur arbre moyen → comptes folders/files/missing corrects, `parent_resource_id` cohérent, `exists=1` | Fonctionnement de base |
| 2 | `syncRoot(A)` + `syncDevice()` lancés en parallèle via `Promise.all` → `maxConcurrent` (compteur dans mock `withTransaction`) = 1 | Single-flight fonctionne |
| 3 | Walk deux fois de suite → pas de doublon, pas de `SQLITE_CONSTRAINT`, mêmes `resource_id` | Idempotence |
| 4 | Walk une fois → modifier l'arbre SAF (supprimer un fichier) → walk à nouveau → `missing > 0`, le fichier a `exists=0` | Réconciliation |
| 5 | `syncDevice` avec 2 roots → les deux sont walkés, comptes corrects | Walk multi-roots |

Setup/teardown :

```typescript
beforeEach(() => {
  h = createHarness();
  for (const migration of MIGRATIONS) await migration.up(h);
  __setDbForTests(h);
  __setWithTransactionForTests(async (work) => work());
  restoreFns.push(fakeSaf());
});

afterEach(() => {
  __setDbForTests(null);
  __setWithTransactionForTests(null);
  while (restoreFns.length) restoreFns.pop()?.();
});
```

### 4. `package.json` — ajouter le script de test

```json
"test:syncDevice": "tsx --test tests/syncDevice.test.ts"
```

Et ajouter au script `test` :

```json
"test": "npm run test:db && npm run test:api && npm run test:sync && npm run test:saf && npm run test:syncDevice"
```

## Ce qui ne change PAS

| Fichier | Pourquoi |
|---------|----------|
| `services/db/repositories/folders.ts` | `saveFolder`/`saveFile` inchangés — le single-flight empêche les écritures concurrentes |
| `services/db/repositories/files.ts` | Idem |
| `app/index.tsx` | `handlePickDirectory` continue d'appeler `syncRoot()` — la sérialisation est transparente |
| `features/syncDevice.types.ts` | `SyncResult` identique |
| `services/safWalk.ts` | `listFoldersChunked` + `yieldToMainThread` inchangés |
| `services/db/migrations.ts` | Aucun changement de schéma |

## Résultat attendu

| Avant | Après |
|-------|-------|
| Walk de 3min → UI gelée (reads bloqués par la transaction) | Walk de 3min → UI fluide (listing hors transaction, writes rapides) |
| `syncRoot` manuel + tick background → `SQLITE_CONSTRAINT` silencieux | Sérialisation → tick attend la fin du manuel, pas de concurrence |

## Vérification

```bash
cd mobile && npx tsc --noEmit          # typage
cd mobile && npm run test:db           # régression repos + migrations
cd mobile && npm run test:saf          # régression SAF walk
cd mobile && npm run test:syncDevice   # nouveaux tests
cd mobile && npm test                  # tout
```

Test manuel device :
1. Ajouter un dossier vide → walk OK, files apparaissent
2. Ajouter un gros dossier (WhatsApp, >1000 fichiers) → scroll fluide pendant le walk, pas de `walk failed` dans les logs
3. Pendant le walk, attendre le tick de 30s → logs `syncDevice` et `syncRoot` jamais imbriqués (séquentiels)
4. Supprimer un fichier du dossier SAF → après prochain walk, `missing` > 0 dans les logs
