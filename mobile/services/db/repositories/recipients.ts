import { getDatabase } from '../client';
import type { Recipient, RecipientRow, RecipientType } from '../types';

export async function saveRecipient(
  recipientType: RecipientType,
  recipientId: string,
  displayName: string,
): Promise<Recipient> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO recipients (recipient_type, recipient_id, display_name, is_active, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(recipient_id) DO UPDATE SET
       recipient_type = excluded.recipient_type,
       display_name = excluded.display_name,
       is_active = 1,
       updated_at = excluded.updated_at`,
    recipientType,
    recipientId,
    displayName,
    Date.now(),
  );
  const row = await db.getFirstAsync<RecipientRow>(
    'SELECT * FROM recipients WHERE recipient_id = ?',
    recipientId,
  );
  return toRecipient(row!);
}

export async function getRecipients(activeOnly = true): Promise<Recipient[]> {
  const db = await getDatabase();
  const rows = activeOnly
    ? await db.getAllAsync<RecipientRow>(
        'SELECT * FROM recipients WHERE is_active = 1 ORDER BY display_name ASC',
      )
    : await db.getAllAsync<RecipientRow>('SELECT * FROM recipients ORDER BY display_name ASC');
  return rows.map(toRecipient);
}

export async function setRecipientActive(
  recipientType: RecipientType,
  recipientId: string,
  active: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recipients SET is_active = ?, updated_at = ?
     WHERE recipient_type = ? AND recipient_id = ?`,
    active ? 1 : 0,
    Date.now(),
    recipientType,
    recipientId,
  );
}

function toRecipient(row: RecipientRow): Recipient {
  return {
    recipientType: row.recipient_type,
    recipientId: row.recipient_id,
    displayName: row.display_name,
    isActive: row.is_active === 1,
    updatedAt: row.updated_at,
  };
}