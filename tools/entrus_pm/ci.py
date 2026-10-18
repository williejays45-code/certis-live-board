"""Read-only PR/change guard. No shell interpolation, credentials, deployment or paid calls."""
from pathlib import Path
import json
import os
import subprocess
import sys
from pm import engine as e


def run():
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip())
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    event = e.read_json(Path(event_path)) if event_path else {}
    name = os.environ.get("GITHUB_EVENT_NAME", "local")
    base = None
    if name == "pull_request":
        base = event["pull_request"]["base"]["sha"]
    elif name == "push":
        before = event.get("before", "")
        if before != "0" * 40:
            base = before
        else:
            default_branch = event.get("repository", {}).get("default_branch")
            if not isinstance(default_branch, str) or not default_branch:
                raise e.Invalid("DEFAULT_BRANCH_UNKNOWN")
            base = subprocess.run(["git", "-C", str(root), "merge-base", "HEAD", "refs/remotes/origin/" + default_branch], check=True, capture_output=True, text=True, timeout=30).stdout.strip()
    args = ["git", "-C", str(root), "ls-files", "-z"]
    if base:
        if not e.COMMIT.fullmatch(base):
            raise e.Invalid("EXACT_BASE_COMMIT_REQUIRED")
        args = ["git", "-C", str(root), "diff", "--name-only", "--diff-filter=ACMRT", "-z", base, "HEAD", "--"]
    raw = subprocess.run(args, check=True, capture_output=True, timeout=30).stdout
    paths = [v for v in raw.decode("utf-8").split("\0") if v]
    result = e.scan(root, paths)
    result["metrics"]["scan_scope"] = "changed_files" if base else "tracked_files"
    result["metrics"]["deployment_verified"] = False
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(run())
    except Exception:
        print(json.dumps(e.report("ci_scan", ["CI_SCAN_UNAVAILABLE"], unknown=True)))
        sys.exit(2)
