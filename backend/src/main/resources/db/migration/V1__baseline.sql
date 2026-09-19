-- Baseline matching the Hibernate schema that shipped with ddl-auto=update.
-- Empty databases run this. Non-empty hosts (Neon) are Flyway-baselined at v1
-- and skip it so existing rows stay put.

CREATE TABLE IF NOT EXISTS app_user (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    reset_token_hash VARCHAR(255),
    reset_token_expires_at TIMESTAMP(6) WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS course (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    term VARCHAR(255),
    owner_id BIGINT REFERENCES app_user (id),
    planned_on DATE
);

CREATE TABLE IF NOT EXISTS material (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES course (id),
    filename VARCHAR(255),
    file_hash VARCHAR(255),
    page_count INTEGER,
    status VARCHAR(255),
    error_message VARCHAR(2000),
    CONSTRAINT uk_material_course_hash UNIQUE (course_id, file_hash)
);

CREATE TABLE IF NOT EXISTS material_pdf (
    material_id BIGINT PRIMARY KEY REFERENCES material (id) ON DELETE CASCADE,
    bytes BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS concept (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES course (id),
    material_id BIGINT NOT NULL REFERENCES material (id),
    name VARCHAR(255),
    summary VARCHAR(1000),
    source_pages VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS question (
    id BIGSERIAL PRIMARY KEY,
    concept_id BIGINT NOT NULL REFERENCES concept (id),
    type VARCHAR(255),
    prompt VARCHAR(4000),
    options_json VARCHAR(4000),
    correct_index INTEGER,
    model_answer VARCHAR(4000),
    rubric VARCHAR(4000),
    source_pages VARCHAR(255),
    explanation VARCHAR(4000),
    option_explanations_json VARCHAR(8000),
    diagram VARCHAR(4000),
    status VARCHAR(255),
    label_answerable BOOLEAN,
    label_correct_answer BOOLEAN,
    label_unambiguous BOOLEAN
);

CREATE TABLE IF NOT EXISTS attempt (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES question (id),
    given_answer VARCHAR(8000),
    verdict VARCHAR(255),
    score DOUBLE PRECISION,
    feedback VARCHAR(4000),
    grader_raw VARCHAR(8000),
    grader_verdict VARCHAR(255),
    overridden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    prev_interval INTEGER,
    prev_ease DOUBLE PRECISION,
    prev_streak INTEGER,
    prev_due_date DATE
);

CREATE TABLE IF NOT EXISTS review_state (
    id BIGSERIAL PRIMARY KEY,
    concept_id BIGINT NOT NULL UNIQUE REFERENCES concept (id),
    interval_days INTEGER NOT NULL,
    ease DOUBLE PRECISION NOT NULL,
    streak INTEGER NOT NULL,
    due_date DATE
);

CREATE TABLE IF NOT EXISTS exam (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES course (id),
    name VARCHAR(255) NOT NULL,
    exam_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_lecture (
    exam_id BIGINT NOT NULL REFERENCES exam (id) ON DELETE CASCADE,
    material_id BIGINT NOT NULL REFERENCES material (id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, material_id)
);

CREATE TABLE IF NOT EXISTS quiz_progress (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL UNIQUE REFERENCES course (id),
    order_json TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    finished BOOLEAN NOT NULL DEFAULT FALSE
);
