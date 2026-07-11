import json
from pathlib import Path

from fastapi import Body, FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from jobagent import db, runner
from jobagent.config import (
    DATA_DIR,
    load_companies_or_empty,
    load_profile_or_empty,
    save_companies,
    save_profile,
)
from jobagent.resume_parser import extract_profile, extract_text

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Job Search AI Agent")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["matched_skills"] = json.loads(d.get("matched_skills") or "[]")
    d["missing_skills"] = json.loads(d.get("missing_skills") or "[]")
    return d


def _status_counts(conn) -> dict:
    return {
        status: len(db.jobs_by_status(conn, status))
        for status in ("new", "scored", "interested", "skipped")
    }


@app.get("/")
def dashboard(request: Request):
    with db.connect() as conn:
        jobs = [_row_to_dict(r) for r in db.jobs_by_status(conn, "scored", order_by_score=True)]
        counts = _status_counts(conn)
    return templates.TemplateResponse(
        request, "dashboard.html", {"jobs": jobs, "counts": counts}
    )


@app.get("/profile")
def profile_page(request: Request):
    profile = load_profile_or_empty()
    return templates.TemplateResponse(request, "profile.html", {"profile": profile})


@app.post("/profile")
def save_profile_route(data: dict = Body(...)):
    save_profile(data)
    return {"ok": True}


@app.post("/profile/resume")
async def upload_resume(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".pdf", ".docx"):
        return JSONResponse({"error": "Only .pdf and .docx resumes are supported."}, status_code=400)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dest = DATA_DIR / f"resume{suffix}"
    contents = await file.read()
    dest.write_bytes(contents)

    try:
        text = extract_text(dest)
        extracted = extract_profile(text)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    return {"extracted": extracted}


@app.get("/companies")
def companies_page(request: Request):
    companies = load_companies_or_empty()
    return templates.TemplateResponse(request, "companies.html", {"companies": companies})


@app.post("/companies")
def save_companies_route(data: dict = Body(...)):
    save_companies(data)
    return {"ok": True}


@app.post("/api/discover")
def api_discover():
    started = runner.start_discover()
    return {"started": started}


@app.post("/api/score")
def api_score():
    started = runner.start_score()
    return {"started": started}


@app.get("/api/status")
def api_status():
    return runner.get_state()


@app.get("/api/jobs")
def api_jobs(status: str = "scored"):
    with db.connect() as conn:
        jobs = [_row_to_dict(r) for r in db.jobs_by_status(conn, status, order_by_score=True)]
        counts = _status_counts(conn)
    return {"jobs": jobs, "counts": counts}


@app.post("/api/jobs/{job_id}/status")
def api_set_job_status(job_id: str, data: dict = Body(...)):
    new_status = data.get("status")
    if new_status not in ("interested", "skipped", "new", "scored"):
        return JSONResponse({"error": "invalid status"}, status_code=400)
    with db.connect() as conn:
        db.set_status(conn, job_id, new_status)
    return {"ok": True}
