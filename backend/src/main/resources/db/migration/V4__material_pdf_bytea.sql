-- material_pdf exists in three shapes, and this leaves every host with V1's.
--   Missing: a host baselined at v1 that never booted the build that added the table,
--     such as a local database. V1 never runs there, so nothing made it.
--   oid, no foreign key: a host where Hibernate's ddl-auto made it before Flyway took
--     over, such as the live one. Each PDF sits in a Postgres large object.
--   bytea with the foreign key: a host V1 built. Nothing changes there.
-- MaterialPdf now maps plain bytea, so large objects are copied into the row and freed.

CREATE TABLE IF NOT EXISTS material_pdf (
    material_id BIGINT PRIMARY KEY REFERENCES material (id) ON DELETE CASCADE,
    bytes BYTEA NOT NULL
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'material_pdf'
                 AND column_name = 'bytes' AND data_type = 'oid') THEN
        ALTER TABLE material_pdf ADD COLUMN bytes_inline BYTEA;
        UPDATE material_pdf p SET bytes_inline = lo_get(p.bytes)
            WHERE EXISTS (SELECT 1 FROM pg_largeobject_metadata l WHERE l.oid = p.bytes);
        -- MaterialPdf was the only @Lob the app ever had, and Hibernate never freed the
        -- object a replaced or deleted PDF left behind, so every large object this role
        -- owns is now either copied above or already unreachable
        PERFORM lo_unlink(l.oid) FROM pg_largeobject_metadata l
            WHERE l.lomowner = (SELECT r.oid FROM pg_roles r WHERE r.rolname = current_user);
        -- a row whose large object was already gone has no PDF left to keep
        DELETE FROM material_pdf WHERE bytes_inline IS NULL;
        ALTER TABLE material_pdf DROP COLUMN bytes;
        ALTER TABLE material_pdf RENAME COLUMN bytes_inline TO bytes;
        ALTER TABLE material_pdf ALTER COLUMN bytes SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'material_pdf'::regclass AND contype = 'f') THEN
        -- a PDF whose lecture is gone can never be opened again, and would block the key
        DELETE FROM material_pdf p WHERE NOT EXISTS (SELECT 1 FROM material m WHERE m.id = p.material_id);
        ALTER TABLE material_pdf ADD CONSTRAINT material_pdf_material_id_fkey
            FOREIGN KEY (material_id) REFERENCES material (id) ON DELETE CASCADE;
    END IF;
END $$;
