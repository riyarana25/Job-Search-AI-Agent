import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT_DIR / "config"
DATA_DIR = ROOT_DIR / "data"

load_dotenv(ROOT_DIR / ".env")


class ConfigError(RuntimeError):
    pass


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        example = path.with_suffix("").with_name(path.stem + ".example" + path.suffix)
        raise ConfigError(
            f"Missing {path.name}. Copy {example.name} to {path.name} in the "
            f"config/ folder and fill it in."
        )
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_profile() -> dict:
    return _load_yaml(CONFIG_DIR / "profile.yaml")


def load_companies() -> dict:
    return _load_yaml(CONFIG_DIR / "companies.yaml")


def load_profile_or_empty() -> dict:
    path = CONFIG_DIR / "profile.yaml"
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_companies_or_empty() -> dict:
    path = CONFIG_DIR / "companies.yaml"
    if not path.exists():
        return {"greenhouse": [], "lever": [], "title_keywords": [], "location_keywords": []}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def save_profile(data: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_DIR / "profile.yaml", "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)


def save_companies(data: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_DIR / "companies.yaml", "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)


def get_anthropic_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise ConfigError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    return key


def get_anthropic_model() -> str:
    return os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")


def profile_summary(profile: dict) -> str:
    """Render the profile dict into a compact text block for LLM prompts."""
    lines = []

    contact = profile.get("contact", {})
    lines.append(f"Name: {contact.get('full_name', '')}")
    lines.append(f"Location: {contact.get('location', '')}")

    prefs = profile.get("preferences", {})
    lines.append(f"Target titles: {', '.join(prefs.get('target_titles', []))}")
    lines.append(f"Target locations: {', '.join(prefs.get('target_locations', []))}")
    lines.append(f"Remote only: {prefs.get('remote_only', False)}")
    lines.append(f"Work authorization: {prefs.get('work_authorization', '')}")
    lines.append(f"Experience level: {prefs.get('min_experience_level', '')}")

    lines.append("\nEducation:")
    for edu in profile.get("education", []):
        lines.append(
            f"- {edu.get('degree', '')} in {edu.get('field', '')}, "
            f"{edu.get('institution', '')} ({edu.get('start_date', '')} - {edu.get('end_date', '')})"
        )

    lines.append("\nExperience:")
    for exp in profile.get("experience", []):
        lines.append(
            f"- {exp.get('title', '')} at {exp.get('company', '')} "
            f"({exp.get('start_date', '')} - {exp.get('end_date', '')})"
        )
        for bullet in exp.get("bullets", []):
            lines.append(f"    - {bullet}")

    skills = profile.get("skills", {})
    all_skills = [s for group in skills.values() for s in group]
    lines.append(f"\nSkills: {', '.join(all_skills)}")

    return "\n".join(lines)
