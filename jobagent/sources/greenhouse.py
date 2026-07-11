import requests

from jobagent.models import Job
from jobagent.sources.base import filter_jobs, strip_html

API_URL = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs"


def fetch(companies_config: dict) -> list[Job]:
    entries = companies_config.get("greenhouse", []) or []
    title_keywords = companies_config.get("title_keywords", []) or []
    location_keywords = companies_config.get("location_keywords", []) or []

    jobs: list[Job] = []
    for entry in entries:
        name = entry["name"]
        token = entry["token"]
        url = API_URL.format(token=token)
        try:
            resp = requests.get(url, params={"content": "true"}, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            print(f"  [greenhouse] failed to fetch {name} ({token}): {exc}")
            continue

        for posting in resp.json().get("jobs", []):
            jobs.append(
                Job(
                    source="greenhouse",
                    company=name,
                    title=posting.get("title", ""),
                    url=posting.get("absolute_url", ""),
                    location=(posting.get("location") or {}).get("name", ""),
                    description=strip_html(posting.get("content", "")),
                    posted_at=posting.get("updated_at", ""),
                )
            )

    return filter_jobs(jobs, title_keywords, location_keywords)
