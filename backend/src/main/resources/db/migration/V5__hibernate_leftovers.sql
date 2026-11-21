-- A host whose tables Hibernate's ddl-auto made before Flyway kept a few things V1 never
-- had, and is missing two it has. This matches such a host to V1. A host V1 built has
-- none of them, so nothing here changes it, and no row is touched anywhere.

DO $$
DECLARE
    c record;
BEGIN
    -- file_hash was unique across all courses until accounts arrived. Now a course holds a
    -- file once, so the same slides can be in two courses (uk_material_course_hash stays).
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'material'::regclass AND contype = 'u'
               AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                   WHERE attrelid = 'material'::regclass AND attname = 'file_hash')]
    LOOP
        EXECUTE format('ALTER TABLE material DROP CONSTRAINT %I', c.conname);
    END LOOP;

    -- Hibernate pinned each enum column to the values the enum had then, so a new value
    -- would be refused here and accepted everywhere else. V1 has no CHECK constraints.
    FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
             WHERE conrelid IN ('attempt'::regclass, 'material'::regclass, 'question'::regclass)
               AND contype = 'c'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
    END LOOP;

    -- deleting an exam or a lecture takes its exam links with it, as V1 declares
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'exam_lecture'::regclass AND contype = 'f' AND confdeltype <> 'c'
    LOOP
        EXECUTE format('ALTER TABLE exam_lecture DROP CONSTRAINT %I', c.conname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exam_lecture'::regclass
                   AND contype = 'f' AND confrelid = 'exam'::regclass) THEN
        ALTER TABLE exam_lecture ADD CONSTRAINT exam_lecture_exam_id_fkey
            FOREIGN KEY (exam_id) REFERENCES exam (id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exam_lecture'::regclass
                   AND contype = 'f' AND confrelid = 'material'::regclass) THEN
        ALTER TABLE exam_lecture ADD CONSTRAINT exam_lecture_material_id_fkey
            FOREIGN KEY (material_id) REFERENCES material (id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE attempt ALTER COLUMN overridden SET DEFAULT FALSE;
ALTER TABLE quiz_progress ALTER COLUMN finished SET DEFAULT FALSE;
