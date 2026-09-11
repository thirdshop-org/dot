# Revue du codebase mobile — Retours & Actions

## Bugs confirmes (P0)

### 1. `isChildOf` trop large
- **Fichier** : `features/syncDevice.ts:39-41`
- **Probleme** : `uri.startsWith(rootUri)` matche les siblins (`Documents` matche `Documents-archive`). Le pass de reconciliation marque `exists = 0` sur le mauvais root.
- **Fix** : `uri === rootUri || uri.startsWith(rootUri + '/')`

### 2. Cache OCR casse
- **Fichier** : `hooks/useUpload.ts:35`
- **Probleme** : `setQueryData` stocke un `OcrJob` brut, mais `useOcrJob` attend `ApiData<OcrJob>` (enveloppe `{ data }`). Resultat : `TypeError` sur `.data.status`.
- **Fix** : `queryClient.setQueryData(['ocr', result.data.id], result)`

### 3. Outbox catch trop large
- **Fichier** : `features/syncOutbox.ts:46-52`
- **Probleme** : Toutes les erreurs (y compris 400 permanent) sont traitees comme transitoires. Un 400 boucle a 15s sans jamais dead-letter.
- **Fix** : Whitelist les erreurs transitoires (`NETWORK_ERROR`, `HTTP_5xx`, AbortError) ; les 4xx permanents doivent incrementer `attempts` via `markPendingOperation('failed')`.

### 4. `canAccess` nie l'acces au proprietaire avec cache expire
- **Fichier** : `services/db/repositories/permissions.ts:151-171`
- **Probleme** : Si une permission exacte est en cache mais expiree, `canAccess` retourne `allowed: false` avant d'atteindre le fallback `owner_id === deviceUserId`. Le device peut etre exclu de ses propres fichiers.
- **Fix** : Verifier le ownership (deviceUserId === owner_id) dans la lignee **avant** le short-circuit du cache expire, ou au minimum avant de retourner `allowed: false`.

### 5. `getFiles()` / `getFolderFolders()` ne filtrent pas `exists = 0`
- **Fichier** : `services/db/repositories/files.ts:75-79`, `folders.ts:96-98`
- **Probleme** : Les fichiers/dossiers supprimes du SAF restent affiches indefiniment dans l'UI.
- **Fix** : Ajouter `WHERE "exists" = 1` aux requetes, ou filtrer dans les ecrans. Attention : les rows cloud-only (`uri = NULL`) ont aussi `exists = false` — il faut distinguer "supprime du disque" de "jamais eu de copie locale". Ne pas filtrer dans le repository si le SAF walk a besoin de voir tous les rows ; filtrer dans les ecrans ou ajouter un flag `deleted_from_disk`.

### 6. Tab navigation = `router.push` sur un Stack
- **Fichier** : `components/FloatingNavBar.tsx:62`, `app/_layout.tsx`
- **Probleme** : Le layout utilise un `<Stack>` et la nav bar fait `router.push(tab.route)`. Chaque switch d'onglet empile un ecran. Le bouton systeme depile tout au lieu de quitter l'app.
- **Fix** : migrer vers le layout `<Tabs>` d'expo-router, ou utiliser `router.replace()` pour les onglets.

---

## Bugs potentiels (P1)

### 7. Race condition dans `recoverDatabase`
- **Fichier** : `services/db/client.ts:54-68`
- **Probleme** : `database = null` avant `closeAsync` permet l'ouverture d'une connexion concurrente via `getDatabase()`.
- **Fix** : Mettre `opening` a une promise de recovery **avant** de clear `database`, ou ajouter un verrou/flag `recovering`.

### 8. Pas de single-flight sur les SAF walks
- **Fichier** : `features/syncDevice.ts`
- **Probleme** : Le loop background (`useSyncDevice`) et le bouton "Add folder" (`handlePickDirectory`) peuvent lancer `syncRoot` en parallele. Courses sur l'upsert URI unique -> `SQLITE_CONSTRAINT` -> transaction annulee.
- **Fix** : Module-level `inFlight` promise partagee par `syncRoot`/`syncDevice`.

### 9. Walk SAF dans une transaction SQLite longue
- **Fichier** : `features/syncDevice.ts:48`
- **Probleme** : `withTransaction` ouvre avant le parcours SAF (potentiellement minutes). Toute lecture DB de l'UI est bloquee.
- **Fix** : Lister d'abord tous les folders/files SAF hors transaction, puis ouvrir la transaction uniquement pour les writes DB.

### 10. `syncMode === 'manual'` se comporte comme `'full'`
- **Fichier** : `features/syncDevice.ts:127-128`
- **Probleme** : Seul `'none'` desactive le loop. Le mode `'manual'` fait aussi un walk complet toutes les 30s.
- **Fix** : Distinguer les modes ; `'manual'` ne devrait pousser que l'outbox/pas de walk SAF automatique.

### 11. Course auth 401 vs bootstrap
- **Fichier** : `context/AuthContext.tsx:32-70`
- **Probleme** : Un 401 background peut appeler `signOut()` pendant que `bootstrap` restaure le token, restaurant une session revoquee.
- **Fix** : Monotonic "session epoch" verifiee apres chaque await.

### 12. `markPendingOperation` race read-modify-write sur `attempts`
- **Fichier** : `services/db/repositories/pendingOps.ts:118-124`
- **Probleme** : Deux `SELECT attempts` concurrents lisent la meme valeur, ecrivent la meme. Le compteur ne progresse pas correctement.
- **Fix** : `UPDATE SET attempts = attempts + 1` atomique avec `RETURNING attempts`, ou `UPDATE ... WHERE id = ?` puis relire.

### 13. `refreshPermissions` race cross-account
- **Fichier** : `features/syncOutbox.ts:78-89`
- **Probleme** : Lecture de `activeUserId`, puis requete reseau, puis `saveResourcePermission` relit `getActiveUserId()` (possiblement change).
- **Fix** : Capturer `activeUserId` + token au debut du tick, les reutiliser pour toute la duree.

### 14. Migration v5 — `PRAGMA foreign_keys` hors `try/finally`
- **Fichier** : `services/db/migrations.ts:254, 259`
- **Probleme** : Si la transaction v4/v5 echoue, FK enforcement reste desactive jusqu'au restart du process.
- **Fix** : Wrapper `PRAGMA foreign_keys = OFF/ON` dans un `try/finally`.

### 15. Dead-lettered operations bloquent `pushStatus` a `'failed'` permanemment
- **Fichier** : `services/db/repositories/pendingOps.ts` + `shares.ts`/`shareLinks.ts` (`PUSH_STATUS_SQL`)
- **Probleme** : Apres `MAX_PENDING_ATTEMPTS`, l'op est `'failed'` et `PUSH_STATUS_SQL` retourne toujours `'failed'` pour la ref, meme si un opration ulterieure reussit.
- **Fix** : Ajouter un path de cleanup/cancel pour les dead-letters, ou ignorer les `'failed'` plus anciens que le plus recent `'completed'` dans le subquery.

### 16. Erreurs SAF silencieuses → faux "dossier vide"
- **Fichier** : `services/safDirectory.ts:23-25, 33-35`
- **Probleme** : `pickDirectory` et `listDirectory` catchent toutes les erreurs et retournent `null`/`[]`. Une revocation de permission SAF est interpretee comme "dossier vide" → tous les descendants marques `exists = 0` lors de la reconciliation.
- **Fix** : Distinguer "empty" (pas d'entrees) de "error" (exception lancee). Propager l'erreur ou retourner un type `{ entries: [], error?: string }`.

---

## Mauvaises pratiques

| # | Fichier | Probleme | Action |
|---|---|---|---|
| B1 | `context/AuthContext.tsx` | `signIn`/`signOut`/`continueWithoutAccount` non wrappes en `useCallback` | Ajouter `useCallback` |
| B2 | `components/FloatingNavBar.tsx:62` | `router.push(tab.route as any)` — `as any` masque les erreurs de type | Migrer vers layout `Tabs` expo-router ou typer correctement |
| B3 | `app/index.tsx:95-106` | Pas de loading/disable sur le bouton "Add folder" | Ajouter etat `syncing`, disable le bouton, spinner |
| B4 | `hooks/useUpload.ts:25-27` | `useOcrJob` poll infiniment sur `failed` | Stop sur `done` OU `failed` |
| B5 | `api/client.ts:110-126` | Timeout AbortController couvre `fetch()` mais pas `response.json()` | Passer le signal a `response.json()` ou ajouter un timeout sur la lecture body |
| B6 | 5+ fichiers | Couleurs/design tokens hardcodes | Extraire dans `constants/theme.ts` |
| B7 | `app/index.tsx` + `app/folder/[id].tsx` | `formatSize` duplique | Extraire dans `utils/format.ts` |
| B8 | `console.info`/`console.warn` | Disperses dans les chemins production | Gate derriere `__DEV__` ou logger |
| B9 | `app.json` | Nom = `"webui"` / `com.anonymous.webui` | Renommer en VaultDrop |
| B10 | `api/client.ts:18,21` | Erreurs hardcoded en francais (`'Serveur injoignable'`) | Utiliser i18n |
| B11 | `app/folder/[id].tsx:30-39` | 3 requetes DB sequentielles au focus | `Promise.all` |
| B12 | `app/login.tsx` | Password input manque `autoCapitalize="none"`, `autoCorrect={false}` | Ajouter les props |
| B13 | `app/folder/[id].tsx` | File rows Pressable mais onPress no-op | Retirer Pressable des fichiers ou ajouter une action |
| B14 | `app/_layout.tsx` + ecrans | `Stack.Screen options` defini en double (layout + ecran) | Un seul endroit |
| B15 | `features/syncDevice.ts` | Boucle sync tourne en background sans awareness `AppState` | Stopper le loop quand `AppState` est `background`, reprendre au `foreground` |
| B16 | `services/db/repositories/files.ts:20`, `folders.ts:15` | `getDeviceUserId()` appele a chaque `saveFolder`/`saveFile` (N+1, 4 round-trips par row) | Hoister `device_user_id` en parametre ou le cacher au debut du tick |
| B17 | `services/db/repositories/pendingOps.ts:100-107` | `scheduleRetries` fait N UPDATEs sequentiels | Batch `UPDATE WHERE id IN (...)` |

---

## Pieces manquantes

| # | Element | Action |
|---|---|---|
| M1 | `services/distantStorage.ts` — fichier vide | Supprimer |
| M2 | `app/search.tsx` et `app/settings.tsx` — placeholders vides | Implementer ou supprimer les onglets |
| M3 | `hooks/` — tous inutilises par les ecrans | Les brancher ou les supprimer |
| M4 | `getDeviceAuthToken`/`saveDeviceAuthToken` dans SQLite — non utilise (token dans SecureStore) | Supprimer ou marquer `@internal` |
| M5 | Aucun loading state dans les ecrans principaux | Ajouter des etats de chargement |
| M6 | Aucun error boundary React | Ajouter un `ErrorBoundary` au layout racine |
| M7 | Pas de pull-to-refresh | Ajouter `RefreshControl` |
| M8 | `AGENTS.md` mentionne v4 alors que le code est a v5 | Mettre a jour la doc |
| M9 | `localStorage.ts` — re-export legacy utilise par les ecrans | Migrer les imports vers `services/db` |

---

## Accessibilite

- **Zero proprietes d'accessibilite** dans l'app (0 matches `accessibilityRole`, `accessibilityLabel`, `aria-*`)
- Les tabs de la nav n'annoncent pas leur etat selectionne
- Les erreurs visuelles (couleur) ne sont pas announcees aux lecteurs d'ecran
- Les icons decoratives sont lues par les screen readers

**Action** : Pass d'accessibilite minimal — `accessibilityRole`, `accessibilityState`, `accessibilityLabel` sur les elements interactifs.

---

## Performance

| Probleme | Fichier | Impact | Action |
|----------|---------|--------|--------|
| Walk SAF dans transaction SQLite longue | `features/syncDevice.ts:48` | Bloque les writes UI pendant le walk | Lister les entries SAF hors transaction, puis transaction uniquement pour les writes |
| N+1 pattern sur `saveFolder`/`saveFile` | `services/db/repositories/files.ts:20`, `folders.ts:15` | 4 round-trips par row (`getDeviceUserId` a chaque fois) | Hoister `device_user_id` en parametre ou le cacher au debut du tick |
| `scheduleRetries` — N UPDATEs sequentiels | `services/db/repositories/pendingOps.ts:100-107` | Lent pour gros batches | Un seul `UPDATE WHERE id IN (...)` |
| 3 requetes DB sequentielles au focus | `app/folder/[id].tsx:30-39` | Lent sur gros dossiers | `Promise.all` |
| Boucle sync sans awareness AppState | `features/syncDevice.ts:125-135` | Gaspille batterie en background | Stopper le loop quand `AppState` est `background` |
| Pas de pull-to-refresh | `app/index.tsx`, `app/folder/[id].tsx` | UI ne se met a jour qu'au refocus | Ajouter `RefreshControl` |

---

## Actions planifiees (ordre de priorite)

### P0 — Corriger immediatement
- [x] 1. Fix `isChildOf` — boundary `/` (`features/syncDevice.ts`)
- [x] 2. Fix cache OCR — `{ data: result.data }` (`hooks/useUpload.ts`)
- [x] 3. Distinguer erreurs reseau / erreurs API dans l'outbox (`features/syncOutbox.ts`)
- [x] 4. Fix `canAccess` owner vs cache expire (`services/db/repositories/permissions.ts`)
- [x] 5. Filtrer `exists` dans `getFiles`/`getFolderFolders` ou les ecrans
- [ ] 6. Migrer la tab navigation vers `<Tabs>` ou `router.replace()` (`components/FloatingNavBar.tsx`)

### P1 — Fixer rapidement
- [ ] 7. Race `recoverDatabase` — serialiser l'ouverture (`services/db/client.ts`)
- [ ] 8. Single-flight sur `syncRoot`/`syncDevice` (`features/syncDevice.ts`)
- [ ] 9. `syncMode 'manual'` gate (`features/syncDevice.ts`)
- [ ] 10. `useCallback` pour `signIn`/`signOut` (`context/AuthContext.tsx`)
- [ ] 11. Atomic `attempts + 1` dans `markPendingOperation` (`services/db/repositories/pendingOps.ts`)
- [ ] 12. Course auth 401 vs bootstrap (`context/AuthContext.tsx`)
- [ ] 13. `refreshPermissions` race cross-account (`features/syncOutbox.ts`)
- [ ] 14. `PRAGMA foreign_keys` dans `try/finally` (`services/db/migrations.ts`)
- [ ] 15. Dead-letter cleanup pour `pushStatus` (`services/db/repositories/pendingOps.ts` + `shares.ts`/`shareLinks.ts`)
- [ ] 16. Erreurs SAF — distinguer "empty" de "error" (`services/safDirectory.ts`)
- [ ] 17. Awareness `AppState` sur la boucle sync (`features/syncDevice.ts`)
- [ ] 18. Hoister `device_user_id` (N+1) dans `saveFolder`/`saveFile`
- [ ] 19. Batch `scheduleRetries` (`UPDATE WHERE id IN (...)`)

### P2 — Ameliorations
- [ ] 20. Error boundary au layout racine (`app/_layout.tsx`)
- [ ] 21. Loading/disable sur "Add folder" (`app/index.tsx`)
- [ ] 22. Extraire `formatSize` en utilitaire partage (`utils/format.ts`)
- [ ] 23. Centraliser les couleurs dans un theme (`constants/theme.ts`)
- [ ] 24. `useOcrJob` — stop poll sur `failed` (`hooks/useUpload.ts`)
- [ ] 25. Password input — `autoCapitalize`, `autoCorrect` (`app/login.tsx`)
- [ ] 26. Retirer Pressable des file rows ou ajouter une action (`app/folder/[id].tsx`)
- [ ] 27. `Promise.all` pour les 3 requetes DB au focus (`app/folder/[id].tsx`)
- [ ] 28. Pass d'accessibilite minimal
- [ ] 29. Gate `console.*` derriere `__DEV__`

### P3 — Nettoyage
- [ ] 30. Supprimer `services/distantStorage.ts`
- [ ] 31. Supprimer `getDeviceAuthToken`/`saveDeviceAuthToken` de SQLite
- [ ] 32. Mettre a jour `AGENTS.md` a v5
- [ ] 33. Migrer les imports `localStorage.ts` vers `services/db`
- [ ] 34. Renommer l'app (`app.json` + `package.json`)
- [ ] 35. Localiser les messages d'erreur API
- [ ] 36. Implementer `search.tsx` et `settings.tsx` ou supprimer les onglets
- [ ] 37. Supprimer/brancher les hooks inutilises dans `hooks/`
