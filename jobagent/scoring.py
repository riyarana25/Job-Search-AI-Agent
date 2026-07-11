import json
import sqlite3
from typing import Callable, Optional

import anthropic

from jobagent import db
from jobagent.config import get_anthropic_api_key, get_anthropic_model, profile_summary

MAX_DESCRIPTION_CHARS = 6000

SCORE_TOOL = {
    "name": "record_fit_score",
    "description": "Record how well a candidate profile fits a job posting.",
    "input_schema": {
        "type": "object",
        "properties": {
            "score": {
                "type": "integer",
                "description": "Fit score from 0 (no fit) to 100 (excellent fit).",
                "minimum": 0,
                "maximum": 100,
            },
            "reasoning": {
                "type": "string",
                "description": "2-4 sentences explaining the score.",
            },
            "matched_skills": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Skills/requirements from the posting the candidate already has.",
            },
            "missing_skills": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Skills/requirements from the posting the candidate is missing.",
            },
        },
        "required": ["score", "reasoning", "matched_skills", "missing_skills"],
    },
}

SYSTEM_PROMPT = """You are a blunt, accurate technical recruiter evaluating whether a \
candidate should apply to a job. Score fit honestly based only on the profile and job \
description given -- do not assume skills or experience the candidate hasn't listed. \
Weigh required qualifications, seniority level, and location/work-authorization match. \
Always respond by calling the record_fit_score tool."""


def score_job(client: anthropic.Anthropic, model: str, profile_text: str, job_title: str,
              job_company: str, job_description: str) -> dict:
    description = job_description[:MAX_DESCRIPTION_CHARS]

    message = client.messages.create(
        model=model,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        tools=[SCORE_TOOL],
        tool_choice={"type": "tool", "name": "record_fit_score"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"CANDIDATE PROFILE:\n{profile_text}\n\n"
                    f"JOB POSTING:\nTitle: {job_title}\nCompany: {job_company}\n"
                    f"Description:\n{description}"
                ),
            }
        ],
    )

    for block in message.content:
        if block.type == "tool_use" and block.name == "record_fit_score":
            return block.input

    raise RuntimeError("Claude did not return a record_fit_score tool call")


def score_new_jobs(
    conn: sqlite3.Connection,
    profile: dict,
    on_progress: Optional[Callable[[int, int, str], None]] = None,
) -> int:
    client = anthropic.Anthropic(api_key=get_anthropic_api_key())
    model = get_anthropic_model()
    profile_text = profile_summary(profile)

    rows = db.jobs_by_status(conn, "new")
    total = len(rows)
    scored_count = 0

    for i, row in enumerate(rows, start=1):
        try:
            result = score_job(
                client, model, profile_text, row["title"], row["company"], row["description"] or ""
            )
        except Exception as exc:
            print(f"  [scoring] failed for {row['company']} - {row['title']}: {exc}")
            if on_progress:
                on_progress(i, total, f"failed: {row['company']} - {row['title']}")
            continue

        db.set_score(
            conn,
            job_id=row["id"],
            score=int(result["score"]),
            reasoning=result["reasoning"],
            matched_skills=json.dumps(result.get("matched_skills", [])),
            missing_skills=json.dumps(result.get("missing_skills", [])),
        )
        scored_count += 1
        message = f"scored {result['score']:3d}  {row['company']} - {row['title']}"
        print(f"  {message}")
        if on_progress:
            on_progress(i, total, message)

    return scored_count
