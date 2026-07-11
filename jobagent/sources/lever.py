import requests

from jobagent.models import Job
from jobagent.sources.base import filter_jobs, strip_html

API_URL = "https://api.lever.co/v0/postings/{token}"


def fetch(companies_config: dict) -> list[Job]:
    entries = companies_config.get("lever", []) or []
    title_keywords = companies_config.get("title_keywords", []) or []
    location_keywords = companies_config.get("location_keywords", []) or []

    jobs: list[Job] = []
    for entry in entries:
        name = entry["name"]
        token = entry["token"]
        url = API_URL.format(token=token)
        try:
            resp = requests.get(url, params={"mode": "json"}, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            print(f"  [lever] failed to fetch {name} ({token}): {exc}")
            continue

        for posting in resp.json():
            categories = posting.get("categories", {}) or {}
            jobs.append(
                Job(
                    source="lever",
                    company=name,
                    title=posting.get("text", ""),
                    url=posting.get("hostedUrl", ""),
                    location=categories.get("location", ""),
                    description=strip_html(posting.get("description", "")),
                    posted_at=str(posting.get("createdAt", "")),
                )
            )

    return filter_jobs(jobs, title_keywords, location_keywords)
