import threading
import traceback

from jobagent import db
from jobagent.config import load_companies, load_profile
from jobagent.scoring import score_new_jobs
from jobagent.sources import greenhouse, lever

_lock = threading.Lock()

STATE = {
    "discover": {"status": "idle", "detail": "", "error": None},
    "score": {"status": "idle", "detail": "", "error": None},
}


def get_state() -> dict:
    with _lock:
        return {"discover": dict(STATE["discover"]), "score": dict(STATE["score"])}


def _set(task: str, **fields) -> None:
    with _lock:
        STATE[task].update(fields)


def _run_discover() -> None:
    _set("discover", status="running", detail="starting...", error=None)
    try:
        companies = load_companies()
        new_count = 0
        total_count = 0
        with db.connect() as conn:
            sources = (("greenhouse", greenhouse.fetch), ("lever", lever.fetch))
            for idx, (name, fetch) in enumerate(sources, start=1):
                _set("discover", detail=f"fetching {name}... ({idx}/{len(sources)})")
                jobs = fetch(companies)
                for job in jobs:
                    total_count += 1
                    if db.upsert_job(conn, job):
                        new_count += 1
        _set("discover", status="idle", detail=f"fetched {total_count}, {new_count} new")
    except Exception as exc:
        traceback.print_exc()
        _set("discover", status="idle", detail="", error=str(exc))


def _run_score() -> None:
    _set("score", status="running", detail="starting...", error=None)
    try:
        profile = load_profile()

        def on_progress(done: int, total: int, message: str) -> None:
            _set("score", detail=f"({done}/{total}) {message}")

        with db.connect() as conn:
            count = score_new_jobs(conn, profile, on_progress=on_progress)
        _set("score", status="idle", detail=f"scored {count} job(s)")
    except Exception as exc:
        traceback.print_exc()
        _set("score", status="idle", detail="", error=str(exc))


def start_discover() -> bool:
    with _lock:
        if STATE["discover"]["status"] == "running":
            return False
    threading.Thread(target=_run_discover, daemon=True).start()
    return True


def start_score() -> bool:
    with _lock:
        if STATE["score"]["status"] == "running":
            return False
    threading.Thread(target=_run_score, daemon=True).start()
    return True
