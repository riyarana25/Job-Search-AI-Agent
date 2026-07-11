from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib


@dataclass
class Job:
    source: str
    company: str
    title: str
    url: str
    location: str = ""
    description: str = ""
    posted_at: str = ""

    id: str = field(default="", init=False)
    discovered_at: str = field(default="", init=False)

    def __post_init__(self) -> None:
        self.id = hashlib.sha256(self.url.encode("utf-8")).hexdigest()
        self.discovered_at = datetime.now(timezone.utc).isoformat()
