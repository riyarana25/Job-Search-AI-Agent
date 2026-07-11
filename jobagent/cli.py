import argparse
import json
import sys
import textwrap
import webbrowser

from jobagent import db
from jobagent.config import ConfigError, load_companies, load_profile
from jobagent.scoring import score_new_jobs
from jobagent.sources import greenhouse, lever


def cmd_discover(args: argparse.Namespace) -> None:
    companies = load_companies()

    new_count = 0
    total_count = 0
    with db.connect() as conn:
        for source_name, fetch in (("greenhouse", greenhouse.fetch), ("lever", lever.fetch)):
            print(f"Fetching from {source_name}...")
            jobs = fetch(companies)
            for job in jobs:
                total_count += 1
                if db.upsert_job(conn, job):
                    new_count += 1

    print(f"\nFetched {total_count} postings, {new_count} new.")


def cmd_score(args: argparse.Namespace) -> None:
    profile = load_profile()
    with db.connect() as conn:
        count = score_new_jobs(conn, profile)
    print(f"\nScored {count} job(s).")


def cmd_review(args: argparse.Namespace) -> None:
    with db.connect() as conn:
        rows = db.jobs_by_status(conn, "scored", order_by_score=True)
        if not rows:
            print("Nothing to review. Run `discover` then `score` first.")
            return

        for row in rows:
            print("\n" + "=" * 70)
            print(f"{row['company']} -- {row['title']}  [fit: {row['fit_score']}]")
            print(f"{row['location']}  |  {row['source']}")
            print(row["url"])
            print("-" * 70)
            print(textwrap.fill(row["fit_reasoning"] or "", width=70))
            matched = json.loads(row["matched_skills"] or "[]")
            missing = json.loads(row["missing_skills"] or "[]")
            if matched:
                print(f"Matched: {', '.join(matched)}")
            if missing:
                print(f"Missing: {', '.join(missing)}")

            choice = input("\n[i]nterested / [s]kip / [q]uit > ").strip().lower()
            if choice == "i":
                db.set_status(conn, row["id"], "interested")
            elif choice == "s":
                db.set_status(conn, row["id"], "skipped")
            elif choice == "q":
                break


def cmd_serve(args: argparse.Namespace) -> None:
    import uvicorn

    from jobagent.web import app

    url = f"http://127.0.0.1:{args.port}"
    print(f"Starting JobAgent dashboard at {url}")
    if not args.no_browser:
        webbrowser.open(url)
    uvicorn.run(app, host="127.0.0.1", port=args.port)


def main() -> None:
    parser = argparse.ArgumentParser(prog="jobagent", description="Job search discovery/scoring agent")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("discover", help="Fetch new postings from configured sources")
    subparsers.add_parser("score", help="Fit-score newly discovered postings with Claude")
    subparsers.add_parser("review", help="Interactively review scored postings")

    serve_parser = subparsers.add_parser("serve", help="Start the local web dashboard")
    serve_parser.add_argument("--port", type=int, default=8000)
    serve_parser.add_argument("--no-browser", action="store_true", help="Don't auto-open a browser tab")

    args = parser.parse_args()

    try:
        if args.command == "discover":
            cmd_discover(args)
        elif args.command == "score":
            cmd_score(args)
        elif args.command == "review":
            cmd_review(args)
        elif args.command == "serve":
            cmd_serve(args)
    except ConfigError as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
