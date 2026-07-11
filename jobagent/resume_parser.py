from pathlib import Path

import anthropic
from pypdf import PdfReader
from docx import Document

from jobagent.config import get_anthropic_api_key, get_anthropic_model

PROFILE_TOOL = {
    "name": "record_profile",
    "description": "Record structured candidate profile data extracted from a resume.",
    "input_schema": {
        "type": "object",
        "properties": {
            "contact": {
                "type": "object",
                "properties": {
                    "full_name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "location": {"type": "string"},
                    "linkedin_url": {"type": "string"},
                    "github_url": {"type": "string"},
                    "portfolio_url": {"type": "string"},
                },
            },
            "education": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "institution": {"type": "string"},
                        "degree": {"type": "string"},
                        "field": {"type": "string"},
                        "start_date": {"type": "string"},
                        "end_date": {"type": "string"},
                        "gpa": {"type": "string"},
                    },
                },
            },
            "experience": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "company": {"type": "string"},
                        "title": {"type": "string"},
                        "location": {"type": "string"},
                        "start_date": {"type": "string"},
                        "end_date": {"type": "string"},
                        "bullets": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            "skills": {
                "type": "object",
                "properties": {
                    "languages": {"type": "array", "items": {"type": "string"}},
                    "frameworks": {"type": "array", "items": {"type": "string"}},
                    "tools": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "required": ["contact", "education", "experience", "skills"],
    },
}

SYSTEM_PROMPT = """You extract structured profile data from a resume's raw text. \
Only include information that is actually present in the text -- never invent \
employers, dates, degrees, or skills that aren't stated. If a field isn't present, \
omit it or leave it blank. Always respond by calling the record_profile tool."""


def extract_text(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(file_path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    elif suffix == ".docx":
        doc = Document(str(file_path))
        return "\n".join(p.text for p in doc.paragraphs)
    else:
        raise ValueError(f"Unsupported resume file type: {suffix}")


def extract_profile(text: str) -> dict:
    client = anthropic.Anthropic(api_key=get_anthropic_api_key())
    model = get_anthropic_model()

    message = client.messages.create(
        model=model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        tools=[PROFILE_TOOL],
        tool_choice={"type": "tool", "name": "record_profile"},
        messages=[{"role": "user", "content": f"RESUME TEXT:\n{text[:15000]}"}],
    )

    for block in message.content:
        if block.type == "tool_use" and block.name == "record_profile":
            return block.input

    raise RuntimeError("Claude did not return a record_profile tool call")
