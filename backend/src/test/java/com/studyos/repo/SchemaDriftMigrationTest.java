package com.studyos.repo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * V4 and V5 against the shapes the schema has in the wild. A host whose tables Hibernate's
 * ddl-auto made was baselined at v1 and never ran V1__baseline.sql, so it kept whatever
 * Hibernate built. Each test stands up such a host in a scratch schema, starting from V1's
 * tables with no history and adding the drift it covers, then runs the real migrations.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Tag("jpa")
class SchemaDriftMigrationTest {

    private static final String SCRATCH = "schema_drift";

    @Autowired DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void emptyScratchSchema() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("DROP SCHEMA IF EXISTS " + SCRATCH + " CASCADE");
    }

    @AfterEach
    void dropScratchSchema() {
        jdbc.execute("DROP SCHEMA IF EXISTS " + SCRATCH + " CASCADE");
    }

    // --- V4: material_pdf -------------------------------------------------------------

    @Test
    void aHostBaselinedWithoutThePdfTableGetsItWithTheForeignKey() {
        hibernateSchemaWithoutHistory();
        exec("DROP TABLE %s.material_pdf");

        flyway(null).migrate();

        assertThat(jdbc.queryForObject(scratch("SELECT type FROM %s.flyway_schema_history WHERE version = '1'"),
                String.class)).isEqualTo("BASELINE");
        assertPdfColumnIsNotNullBytea();
        long lecture = lecture(course(), "hash-a");
        storeInline(lecture, new byte[] {1, 2, 3});
        deleteLecture(lecture);
        assertThat(rows("material_pdf")).isZero();
    }

    @Test
    void aHostWhereHibernateMadeThePdfTableKeepsEveryPdfInlineAndFreesEveryLargeObject() {
        hibernateSchemaWithoutHistory();
        exec("DROP TABLE %s.material_pdf");
        // what ddl-auto made from the old @Lob mapping: an oid column and no foreign key
        exec("CREATE TABLE %s.material_pdf (material_id BIGINT NOT NULL, bytes OID NOT NULL, PRIMARY KEY (material_id))");
        long kept = lecture(course(), "hash-kept");
        byte[] pdf = pdfBytes(70_000);
        long keptObject = storeAsLargeObject(kept, pdf);
        long goneLecture = lecture(course(), "hash-gone");
        long orphanObject = storeAsLargeObject(goneLecture, new byte[] {9});
        deleteLecture(goneLecture);
        long brokenLecture = lecture(course(), "hash-broken");
        long freedEarlier = storeAsLargeObject(brokenLecture, new byte[] {8});
        jdbc.queryForObject("SELECT lo_unlink(?::oid)", Integer.class, freedEarlier);
        // the old bytes a re-upload or a lecture delete left behind, which no row points to
        long leaked = jdbc.queryForObject("SELECT lo_from_bytea(0, ?)::bigint", Long.class, (Object) new byte[] {5});

        flyway(null).migrate();

        assertPdfColumnIsNotNullBytea();
        assertThat(jdbc.queryForObject(scratch("SELECT bytes FROM %s.material_pdf WHERE material_id = ?"),
                byte[].class, kept)).isEqualTo(pdf);
        assertThat(rows("material_pdf")).as("the orphan and the row with no large object left are gone").isEqualTo(1);
        assertThat(largeObjectExists(keptObject)).isFalse();
        assertThat(largeObjectExists(orphanObject)).isFalse();
        assertThat(largeObjectExists(leaked)).isFalse();
        deleteLecture(kept);
        assertThat(rows("material_pdf")).as("the new foreign key cascades").isZero();
    }

    // --- V5: what else Hibernate left -----------------------------------------------------

    @Test
    void aHostHibernateBuiltLosesWhatV1NeverHadAndGainsWhatItHas() {
        hibernateSchemaWithoutHistory();
        exec("ALTER TABLE %s.material ADD CONSTRAINT uk3bg57s5cg2dy9yvogub024p92 UNIQUE (file_hash)");
        exec("ALTER TABLE %s.material ADD CONSTRAINT material_status_check CHECK (status IN ('PENDING', 'INGESTED', 'FAILED'))");
        exec("ALTER TABLE %s.question ADD CONSTRAINT question_type_check CHECK (type IN ('MC', 'SHORT_ANSWER'))");
        exec("ALTER TABLE %s.attempt ADD CONSTRAINT attempt_verdict_check CHECK (verdict IN ('CORRECT', 'INCORRECT', 'PENDING'))");
        exec("ALTER TABLE %s.exam_lecture DROP CONSTRAINT exam_lecture_exam_id_fkey");
        exec("ALTER TABLE %s.exam_lecture DROP CONSTRAINT exam_lecture_material_id_fkey");
        exec("ALTER TABLE %s.exam_lecture ADD CONSTRAINT fk7nf6ql4dqqgdpvvh3r1b5w3ow FOREIGN KEY (exam_id) REFERENCES %1$s.exam (id)");
        exec("ALTER TABLE %s.exam_lecture ADD CONSTRAINT fkbqp5d0ag6e9lb4v4kzj2m5fsh FOREIGN KEY (material_id) REFERENCES %1$s.material (id)");
        exec("ALTER TABLE %s.attempt ALTER COLUMN overridden DROP DEFAULT");
        exec("ALTER TABLE %s.quiz_progress ALTER COLUMN finished DROP DEFAULT");

        flyway(null).migrate();

        long first = course();
        lecture(first, "shared-slides");
        long second = course();
        long lecture = lecture(second, "shared-slides");
        assertThatThrownBy(() -> lecture(second, "shared-slides")).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject(scratch("SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND conrelid IN "
                + "('%s.attempt'::regclass, '%1$s.material'::regclass, '%1$s.question'::regclass)"), Integer.class))
                .isZero();
        assertThat(defaultOf("attempt", "overridden")).isEqualTo("false");
        assertThat(defaultOf("quiz_progress", "finished")).isEqualTo("false");
        long midterm = examLinkedTo(second, lecture);
        examLinkedTo(second, lecture);
        jdbc.update(scratch("DELETE FROM %s.exam WHERE id = ?"), midterm);
        assertThat(rows("exam_lecture")).as("an exam takes its lecture links with it").isEqualTo(1);
        deleteLecture(lecture);
        assertThat(rows("exam_lecture")).as("a lecture takes its exam links with it").isZero();
        assertThat(jdbc.queryForObject(scratch("SELECT string_agg(confdeltype::text, '') FROM pg_constraint "
                + "WHERE contype = 'f' AND conrelid = '%s.exam_lecture'::regclass"), String.class))
                .as("exactly two keys, both cascading").isEqualTo("cc");
    }

    private long examLinkedTo(long course, long lecture) {
        long exam = jdbc.queryForObject(scratch("INSERT INTO %s.exam (course_id, name, exam_date) "
                + "VALUES (?, 'Midterm', DATE '2026-12-01') RETURNING id"), Long.class, course);
        jdbc.update(scratch("INSERT INTO %s.exam_lecture (exam_id, material_id) VALUES (?, ?)"), exam, lecture);
        return exam;
    }

    // --- a host V1 built --------------------------------------------------------------

    @Test
    void aHostV1BuiltKeepsItsSchemaAndRows() {
        flyway("3").migrate();
        long course = course();
        long lecture = lecture(course, "hash-v1");
        storeInline(lecture, new byte[] {7, 8, 9});

        flyway(null).migrate();

        assertThat(jdbc.queryForObject(scratch("SELECT string_agg(version || success, ',' ORDER BY installed_rank) "
                + "FROM %s.flyway_schema_history WHERE version IN ('4', '5')"), String.class)).isEqualTo("4true,5true");
        assertThat(jdbc.queryForObject(scratch("SELECT bytes FROM %s.material_pdf WHERE material_id = ?"),
                byte[].class, lecture)).containsExactly(7, 8, 9);
        assertThatThrownBy(() -> lecture(course, "hash-v1")).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject(scratch("SELECT string_agg(confdeltype::text, '') FROM pg_constraint "
                + "WHERE contype = 'f' AND conrelid IN ('%s.exam_lecture'::regclass, '%1$s.material_pdf'::regclass)"),
                String.class)).isEqualTo("ccc");
    }

    // the tables as ddl-auto left them before Flyway: V1's shape, no history table
    private void hibernateSchemaWithoutHistory() {
        flyway("1").migrate();
        exec("DROP TABLE %s.flyway_schema_history");
    }

    private Flyway flyway(String target) {
        FluentConfiguration config = Flyway.configure()
                .dataSource(dataSource)
                .schemas(SCRATCH)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("1");
        return (target == null ? config : config.target(target)).load();
    }

    // %s in a template is the scratch schema
    private static String scratch(String template) {
        return String.format(template, SCRATCH);
    }

    private void exec(String template) {
        jdbc.execute(scratch(template));
    }

    private long course() {
        return jdbc.queryForObject(scratch("INSERT INTO %s.course (name) VALUES ('CS 152') RETURNING id"), Long.class);
    }

    private long lecture(long course, String hash) {
        return jdbc.queryForObject(scratch("INSERT INTO %s.material (course_id, filename, file_hash) "
                + "VALUES (?, 'lecture.pdf', ?) RETURNING id"), Long.class, course, hash);
    }

    private void deleteLecture(long lecture) {
        jdbc.update(scratch("DELETE FROM %s.material WHERE id = ?"), lecture);
    }

    private void storeInline(long lecture, byte[] bytes) {
        jdbc.update(scratch("INSERT INTO %s.material_pdf (material_id, bytes) VALUES (?, ?)"), lecture, bytes);
    }

    private long storeAsLargeObject(long lecture, byte[] bytes) {
        Long object = jdbc.queryForObject("SELECT lo_from_bytea(0, ?)::bigint", Long.class, (Object) bytes);
        jdbc.update(scratch("INSERT INTO %s.material_pdf (material_id, bytes) VALUES (?, ?::oid)"), lecture, object);
        return object;
    }

    private boolean largeObjectExists(long object) {
        return jdbc.queryForObject("SELECT count(*) FROM pg_largeobject_metadata WHERE oid = ?::oid",
                Integer.class, object) > 0;
    }

    private int rows(String table) {
        return jdbc.queryForObject(scratch("SELECT count(*) FROM %s." + table), Integer.class);
    }

    private String defaultOf(String table, String column) {
        return jdbc.queryForObject("SELECT column_default FROM information_schema.columns "
                + "WHERE table_schema = ? AND table_name = ? AND column_name = ?", String.class, SCRATCH, table, column);
    }

    private void assertPdfColumnIsNotNullBytea() {
        assertThat(jdbc.queryForObject("SELECT data_type || ' ' || is_nullable FROM information_schema.columns "
                + "WHERE table_schema = ? AND table_name = 'material_pdf' AND column_name = 'bytes'",
                String.class, SCRATCH)).isEqualTo("bytea NO");
    }

    private static byte[] pdfBytes(int size) {
        byte[] bytes = new byte[size];
        for (int i = 0; i < size; i++) {
            bytes[i] = (byte) (i * 31);
        }
        return bytes;
    }
}
