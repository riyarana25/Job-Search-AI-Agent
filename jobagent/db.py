import sqlite3
from contextlib import contextmanager
from pathlib import Path

from jobagent.config import DATA_DIR
from jobagent.models import Job

DB_PATH = DATA_DIR / "jobs.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    url TEXT NOT NULL,
    description TEXT,
    posted_at TEXT,
    discovered_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    fit_score INTEGER,
    fit_reasoning TEXT,
    matched_skills TEXT,
    missing_skills TEXT
);
"""


@contextmanager
def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def upsert_job(conn: sqlite3.Connection, job: Job) -> bool:
    """Insert a job if it's new. Returns True if it was newly inserted."""
    cur = conn.execute("SELECT 1 FROM jobs WHERE id = ?", (job.id,))
    if cur.fetchone() is not None:
        return False
    conn.execute(
        """
        INSERT INTO jobs (id, source, company, title, location, url, description,
                           posted_at, discovered_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
        """,
        (
            job.id,
            job.source,
            job.company,
            job.title,
            job.location,
            job.url,
            job.description,
            job.posted_at,
            job.discovered_at,
        ),
    )
    return True


def jobs_by_status(conn: sqlite3.Connection, status: str, order_by_score: bool = False):
    query = "SELECT * FROM jobs WHERE status = ?"
    if order_by_score:
        query += " ORDER BY fit_score DESC"
    else:
        query += " ORDER BY discovered_at DESC"
    return conn.execute(query, (status,)).fetchall()


def set_score(
    conn: sqlite3.Connection,
    job_id: str,
    score: int,
    reasoning: str,
    matched_skills: str,
    missing_skills: str,
) -> None:
    conn.execute(
        """
        UPDATE jobs
        SET status = 'scored', fit_score = ?, fit_reasoning = ?,
            matched_skills = ?, missing_skills = ?
        WHERE id = ?
        """,
        (score, reasoning, matched_skills, missing_skills, job_id),
    )


def set_status(conn: sqlite3.Connection, job_id: str, status: str) -> None:
    conn.execute("UPDATE jobs SET status = ? WHERE id = ?", (status, job_id))
