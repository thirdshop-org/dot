-- operation_id outbox : BIGINT → TEXT 32-hex (UUID client-generated)
-- cf. docs/api-v1.md §6.1 — idempotence UNIQUE(device_id, operation_id)
-- survit car le nom de colonne ne change pas.
-- Les traces héritées (ancien protocole, operation_id INTEGER) sont converties
-- en 32-hex paddé (LPAD injectif → l'unicité (device_id, operation_id) tient,
-- et le CHECK 32-hex est satisfait ; valeurs jamais rejouées, traces inertes).
ALTER TABLE operations
    ALTER COLUMN operation_id TYPE TEXT USING LPAD(operation_id::text, 32, '0');

ALTER TABLE operations
    ADD CONSTRAINT operations_operation_id_hex_check
    CHECK (operation_id ~ '^[0-9a-f]{32}$');