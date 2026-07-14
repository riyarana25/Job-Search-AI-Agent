# Job Search AI Agent

A self-hosted agent that discovers new job postings daily and scores how well
they fit your profile, so you stop losing applications to "I was too busy to
check today." You fill in your profile once; the agent does the daily
scanning and tells you which postings are worth your time.

**Current scope (v0.2):** discover postings from Greenhouse and Lever ->
fit-score them with Claude -> review them either in a terminal queue or in a
local web dashboard, and mark `interested` / `skipped`. The dashboard also
handles profile setup (with resume upload that auto-fills the form via
Claude) and the company watchlist, so you don't have to hand-edit YAML.
Resume/cover-letter tailoring, PDF generation, and automatic form-filling are
designed but not built yet (see "Roadmap" below).

## Setup

1. Create a virtual environment and install dependencies:
   ```
   python -m venv venv
   venv\Scripts\activate          # Windows
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and add your own Anthropic API key
   (get one at https://console.anthropic.com/). Each person self-hosting this
   uses their own key -- there's no shared backend.
3. Fill in your profile and company watchlist -- either through the web
   dashboard (recommended, see below) or by hand: copy
   `config/profile.example.yaml` to `config/profile.yaml` and
   `config/companies.example.yaml` to `config/companies.yaml` and edit them
   directly. Everything under `experience`/`education` is treated as ground
   truth for later resume tailoring -- keep it accurate. Both files are
   gitignored since they hold your personal data.

## Usage: web dashboard (recommended)

```
python -m jobagent serve
```

This starts a local server at `http://127.0.0.1:8000` and opens it in your
browser (add `--no-browser` to skip that, or `--port` to use a different
port). From there:

- **Profile** -- fill in your details by hand, or upload a PDF/DOCX resume
  and let Claude auto-fill the form for you. Always review the extracted
  fields before hitting Save -- extraction can miss or misread details, and
  nothing should be saved that isn't actually true.
- **Companies** -- add the Greenhouse/Lever companies you want tracked.
- **Dashboard** -- click "Check for new jobs" and "Score new jobs" to run
  the pipeline with live progress, then mark each scored posting
  Interested/Skip.

This is a single local process for a single person -- nothing here is
exposed beyond `127.0.0.1`. `playwright` is a dependency but its browser
binary (`playwright install chromium`) is only needed for development/testing
right now, not for running the dashboard day-to-day.

## Usage: CLI (alternative)

Run daily (or wire up to Windows Task Scheduler once you're comfortable with it):

```
python -m jobagent discover   # pull new postings from your watchlist
python -m jobagent score      # have Claude fit-score anything new
python -m jobagent review     # walk through scored postings, mark interested/skip
```

Re-running `discover` is safe -- postings are deduplicated by URL, so you
only ever see a given posting once. The CLI and the dashboard share the same
`data/jobs.db` and `config/*.yaml`, so you can mix and match.

## Multi-user / friends setup

This is a template, not a hosted service. Each friend clones this repo and
runs their own copy with their own `profile.yaml`, `companies.yaml`, and
Anthropic API key on their own machine. Nobody's resume, address, or contact
info is ever sent to a shared server -- the only external calls are to the
Anthropic API (for scoring) and to the public Greenhouse/Lever job APIs.

## Safety and ToS notes

- **Greenhouse and Lever** are used here via their public, documented JSON
  endpoints (`boards-api.greenhouse.io`, `api.lever.co`) at a low polling
  rate (run this a few times a day at most, not in a tight loop). This is the
  same data their own public careers pages display.
- **LinkedIn, YC Work at a Startup, and other boards without a public API**
  are *not* implemented yet. Automating LinkedIn in particular is against
  its Terms of Service and can get an account rate-limited or banned --
  when this is added, keep it low-volume, rate-limited, and opt-in. Don't
  point this at LinkedIn for all 4-5 friends simultaneously.
- **Never let resume/cover-letter tailoring invent experience.** The design
  intent (see the plan for Phase 2) is that Claude may only select and
  reword bullets that already exist in `profile.yaml` -- fabricated
  qualifications are both dishonest and tend to fall apart in interviews.
- This tool intentionally does **not** auto-submit applications in v0.1.
  When form-filling and auto-submit are added, keep a `dry_run` flag that
  defaults to on so you can inspect what it would have submitted before
  trusting it to submit for real.

## Roadmap (not built yet)

- Resume + cover letter *tailoring per job posting* (Claude drafts, a second
  Claude call reviews/critiques, rendered to PDF via Playwright). Note this is
  different from the resume upload on the Profile page, which only extracts
  your existing resume into structured profile fields once -- it doesn't
  generate anything yet.
- Playwright-based form autofill for Greenhouse/Lever application forms,
  gated by a `dry_run` flag.
- Additional sources: YC Work at a Startup, RemoteOK, WeWorkRemotely,
  Wellfound, then LinkedIn (rate-limited, opt-in).
- Scheduling instructions for Windows Task Scheduler.
