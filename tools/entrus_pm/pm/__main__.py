"""CLI exit 0 PASS, 1 BLOCKED, 2 UNKNOWN/error. Never converts errors to success."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from . import engine as e


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m pm")
    p.add_argument("command", choices=["release", "reuse", "cloudrun-delta", "archive", "scan", "fleet", "contract", "verify-log"])
    p.add_argument("--input", type=Path)
    p.add_argument("--baseline", type=Path)
    p.add_argument("--policy", type=Path)
    p.add_argument("--policy-sha256")
    p.add_argument("--root", type=Path, default=Path.cwd())
    p.add_argument("--sha256")
    p.add_argument("--receipts", type=Path)
    p.add_argument("--base-ref")
    a = p.parse_args(argv)
    try:
        if a.command in ("release", "fleet"):
            if not a.policy or not a.policy_sha256 or e.file_hash(a.policy) != a.policy_sha256:
                raise e.Invalid("POLICY_PIN_MISMATCH")
            policy = e.read_json(a.policy)
        if a.command == "release":
            r = e.release_gate(policy, e.read_json(a.input), a.root)
        elif a.command == "reuse":
            r = e.reuse(e.read_json(a.baseline), e.read_json(a.input))
        elif a.command == "cloudrun-delta":
            r = e.cloudrun_delta(e.read_json(a.baseline), e.read_json(a.input))
        elif a.command == "archive":
            r = e.archive_check(a.input, a.sha256 or "")
        elif a.command == "fleet":
            r = e.fleet(policy, e.read_json(a.input))
        elif a.command == "contract":
            r = e.contract(e.read_json(a.input))
        elif a.command == "verify-log":
            r = e.verify_receipts(a.input, a.sha256)
        else:
            if a.input:
                paths = e.read_json(a.input)
            else:
                cmd = ["git", "-C", str(a.root), "ls-files", "-z"]
                if a.base_ref:
                    if not e.COMMIT.fullmatch(a.base_ref):
                        raise e.Invalid("EXACT_BASE_COMMIT_REQUIRED")
                    cmd = ["git", "-C", str(a.root), "diff", "--name-only", "--diff-filter=ACMRT", "-z", a.base_ref, "--"]
                raw = subprocess.run(cmd, check=True, capture_output=True, timeout=30).stdout
                paths = [v for v in raw.decode("utf-8", errors="strict").split("\0") if v]
            r = e.scan(a.root, paths)
        if a.receipts:
            r["receipt"] = e.write_receipt(a.receipts, r)
    except e.Invalid as err:
        r = e.report("input_validation", [str(err)], unknown=True)
    except (FileNotFoundError, PermissionError):
        r = e.report("input_access", ["INPUT_ACCESS_UNAVAILABLE"], unknown=True)
    except Exception:
        # Exception text can contain paths, environment values or attacker content.
        r = e.report("input_or_execution", ["INPUT_INVALID_OR_CHECK_UNAVAILABLE"], unknown=True)
    print(json.dumps(r, ensure_ascii=True, sort_keys=True))
    return {"PASS": 0, "BLOCKED": 1, "UNKNOWN": 2}[r["status"]]


if __name__ == "__main__":
    sys.exit(main())
