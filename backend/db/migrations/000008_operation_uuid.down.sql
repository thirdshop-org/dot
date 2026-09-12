ALTER TABLE operations DROP CONSTRAINT operations_operation_id_hex_check;

ALTER TABLE operations
    ALTER COLUMN operation_id TYPE BIGINT USING operation_id::bigint;