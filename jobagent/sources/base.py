import re
from typing import Iterable

from jobagent.models import Job


def matches_keywords(text: str, keywords: list[str]) -> bool:
    """True if keywords is empty, or text contains any keyword (case-insensitive)."""
    if not keywords:
        return True
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in keywords)


def strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def filter_jobs(jobs: Iterable[Job], title_keywords: list[str], location_keywords: list[str]) -> list[Job]:
    return [
        job
        for job in jobs
        if matches_keywords(job.title, title_keywords)
        and matches_keywords(job.location, location_keywords)
    ]
