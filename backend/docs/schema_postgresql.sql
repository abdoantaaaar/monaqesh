BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 34edfa929beb

CREATE TABLE users (
    id SERIAL NOT NULL, 
    university_id VARCHAR(60) NOT NULL, 
    email VARCHAR(254) NOT NULL, 
    name VARCHAR(120) NOT NULL, 
    password_hash VARCHAR(255) NOT NULL, 
    role VARCHAR(20) NOT NULL, 
    is_active BOOLEAN NOT NULL, 
    failed_logins INTEGER NOT NULL, 
    locked_until INTEGER NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (role IN ('professor','ta','student')), 
    UNIQUE (email), 
    UNIQUE (university_id)
);

CREATE TABLE courses (
    id SERIAL NOT NULL, 
    professor_id INTEGER NOT NULL, 
    code VARCHAR(30) NOT NULL, 
    semester VARCHAR(40) NOT NULL, 
    title VARCHAR(120) NOT NULL, 
    description TEXT NOT NULL, 
    is_published BOOLEAN NOT NULL, 
    enrollment_open BOOLEAN NOT NULL, 
    teams_open BOOLEAN NOT NULL, 
    min_team_size INTEGER NOT NULL, 
    max_team_size INTEGER NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (min_team_size >= 1 AND max_team_size >= min_team_size AND max_team_size <= 20), 
    FOREIGN KEY(professor_id) REFERENCES users (id), 
    UNIQUE (code, semester)
);

CREATE INDEX ix_courses_professor_id ON courses (professor_id);

CREATE TABLE sessions (
    id VARCHAR(36) NOT NULL, 
    user_id INTEGER NOT NULL, 
    expires_at INTEGER NOT NULL, 
    revoked BOOLEAN NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE assessments (
    id SERIAL NOT NULL, 
    course_id INTEGER NOT NULL, 
    kind VARCHAR(20) NOT NULL, 
    title VARCHAR(80) NOT NULL, 
    max_score NUMERIC(7, 2) NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (kind IN ('quiz1','quiz2','midterm','practical','project')), 
    CHECK (max_score > 0), 
    FOREIGN KEY(course_id) REFERENCES courses (id), 
    UNIQUE (course_id, kind)
);

CREATE INDEX ix_assessments_course_id ON assessments (course_id);

CREATE TABLE audit_logs (
    id SERIAL NOT NULL, 
    actor_id INTEGER NOT NULL, 
    course_id INTEGER, 
    action VARCHAR(80) NOT NULL, 
    details JSON NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(actor_id) REFERENCES users (id), 
    FOREIGN KEY(course_id) REFERENCES courses (id)
);

CREATE INDEX ix_audit_logs_actor_id ON audit_logs (actor_id);

CREATE INDEX ix_audit_logs_course_id ON audit_logs (course_id);

CREATE TABLE course_tas (
    course_id INTEGER NOT NULL, 
    ta_id INTEGER NOT NULL, 
    can_manage_grades BOOLEAN NOT NULL, 
    can_view_reports BOOLEAN NOT NULL, 
    PRIMARY KEY (course_id, ta_id), 
    FOREIGN KEY(course_id) REFERENCES courses (id), 
    FOREIGN KEY(ta_id) REFERENCES users (id)
);

CREATE TABLE enrollments (
    course_id INTEGER NOT NULL, 
    student_id INTEGER NOT NULL, 
    can_create_team BOOLEAN NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (course_id, student_id), 
    FOREIGN KEY(course_id) REFERENCES courses (id), 
    FOREIGN KEY(student_id) REFERENCES users (id)
);

CREATE TABLE refresh_tokens (
    token_hash VARCHAR(64) NOT NULL, 
    session_id VARCHAR(36) NOT NULL, 
    used BOOLEAN NOT NULL, 
    PRIMARY KEY (token_hash), 
    FOREIGN KEY(session_id) REFERENCES sessions (id)
);

CREATE INDEX ix_refresh_tokens_session_id ON refresh_tokens (session_id);

CREATE TABLE teams (
    id SERIAL NOT NULL, 
    course_id INTEGER NOT NULL, 
    leader_id INTEGER NOT NULL, 
    name VARCHAR(100) NOT NULL, 
    project_title VARCHAR(160) NOT NULL, 
    project_description TEXT NOT NULL, 
    join_code VARCHAR(30) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(course_id) REFERENCES courses (id), 
    FOREIGN KEY(leader_id) REFERENCES users (id), 
    UNIQUE (id, course_id), 
    UNIQUE (join_code)
);

CREATE INDEX ix_teams_course_id ON teams (course_id);

CREATE TABLE grades (
    id SERIAL NOT NULL, 
    assessment_id INTEGER NOT NULL, 
    student_id INTEGER NOT NULL, 
    score NUMERIC(7, 2) NOT NULL, 
    feedback TEXT NOT NULL, 
    is_published BOOLEAN NOT NULL, 
    updated_by INTEGER NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (score >= 0), 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id), 
    FOREIGN KEY(student_id) REFERENCES users (id), 
    FOREIGN KEY(updated_by) REFERENCES users (id), 
    UNIQUE (assessment_id, student_id)
);

CREATE INDEX ix_grades_assessment_id ON grades (assessment_id);

CREATE INDEX ix_grades_student_id ON grades (student_id);

CREATE TABLE submissions (
    id SERIAL NOT NULL, 
    team_id INTEGER NOT NULL, 
    version INTEGER NOT NULL, 
    is_final BOOLEAN NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (version > 0), 
    FOREIGN KEY(team_id) REFERENCES teams (id), 
    UNIQUE (team_id, version)
);

CREATE INDEX ix_submissions_team_id ON submissions (team_id);

CREATE TABLE team_members (
    course_id INTEGER NOT NULL, 
    student_id INTEGER NOT NULL, 
    team_id INTEGER NOT NULL, 
    contribution TEXT NOT NULL, 
    PRIMARY KEY (course_id, student_id), 
    FOREIGN KEY(course_id, student_id) REFERENCES enrollments (course_id, student_id), 
    FOREIGN KEY(team_id, course_id) REFERENCES teams (id, course_id) ON DELETE CASCADE, 
    UNIQUE (team_id, student_id)
);

CREATE INDEX ix_team_members_team_id ON team_members (team_id);

CREATE TABLE discussion_reports (
    id SERIAL NOT NULL, 
    team_id INTEGER NOT NULL, 
    student_id INTEGER NOT NULL, 
    submission_id INTEGER NOT NULL, 
    version INTEGER NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    summary TEXT NOT NULL, 
    questions JSON NOT NULL, 
    created_by INTEGER NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (status IN ('completed','incomplete')), 
    FOREIGN KEY(created_by) REFERENCES users (id), 
    FOREIGN KEY(student_id) REFERENCES users (id), 
    FOREIGN KEY(submission_id) REFERENCES submissions (id), 
    FOREIGN KEY(team_id) REFERENCES teams (id), 
    UNIQUE (team_id, student_id, version)
);

CREATE INDEX ix_discussion_reports_student_id ON discussion_reports (student_id);

CREATE INDEX ix_discussion_reports_team_id ON discussion_reports (team_id);

CREATE TABLE submission_files (
    id SERIAL NOT NULL, 
    submission_id INTEGER NOT NULL, 
    kind VARCHAR(20) NOT NULL, 
    original_name VARCHAR(255) NOT NULL, 
    stored_name VARCHAR(80) NOT NULL, 
    size_bytes INTEGER NOT NULL, 
    sha256 VARCHAR(64) NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (kind IN ('source_code','documentation','presentation','readme')), 
    FOREIGN KEY(submission_id) REFERENCES submissions (id), 
    UNIQUE (stored_name), 
    UNIQUE (submission_id, kind)
);

CREATE INDEX ix_submission_files_sha256 ON submission_files (sha256);

CREATE INDEX ix_submission_files_submission_id ON submission_files (submission_id);

INSERT INTO alembic_version (version_num) VALUES ('34edfa929beb') RETURNING alembic_version.version_num;

COMMIT;

