"""Offline, dependency-free checks. Inputs are evidence, never executable instructions.

Reports deliberately omit input values and paths. SHA pins detect alteration, not
truthfulness or authorship. Protect the policy and evidence collectors separately.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
from datetime import datetime, timezone
import zipfile

VERSION = "0.1.1"
MAX_INPUT = 8 * 1024 * 1024
HEX64 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
STAGES = ("engineering", "promotion", "customer")
KINDS = {
    "engineering": ("tests", "security", "contracts"),
    "promotion": ("tests", "security", "contracts", "config", "rollback", "authorization"),
    "customer": ("tests", "security", "contracts", "config", "rollback", "authorization", "deployment", "customer"),
}


class Invalid(ValueError):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def object_pairs(pairs):
    result = {}
    for k, v in pairs:
        if k in result:
            raise Invalid("DUPLICATE_JSON_KEY")
        result[k] = v
    return result


def read_json(path: Path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_INPUT:
        raise Invalid("INPUT_UNAVAILABLE_OR_OVERSIZE")
    return json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=object_pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Invalid("NONFINITE_JSON")))


def instant(value):
    if not isinstance(value, str):
        raise Invalid("INVALID_TIMESTAMP")
    d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise Invalid("NAIVE_TIMESTAMP")
    return d.astimezone(timezone.utc)


def now_utc():
    return datetime.now(timezone.utc)


def bounded_path(root: Path, name: str) -> Path:
    if not isinstance(name, str) or not name or "\\" in name or ":" in name:
        raise Invalid("UNSAFE_PATH")
    p = PurePosixPath(name)
    if p.is_absolute() or any(v in (".", "..", "") for v in name.split("/")):
        raise Invalid("UNSAFE_PATH")
    base = root.resolve()
    item = root.joinpath(*p.parts)
    cursor = item
    while cursor != root and cursor != cursor.parent:
        if cursor.is_symlink() or (hasattr(cursor, "is_junction") and cursor.is_junction()):
            raise Invalid("LINK_NOT_ALLOWED")
        cursor = cursor.parent
    if not item.resolve().is_relative_to(base):
        raise Invalid("PATH_OUTSIDE_ROOT")
    return item


def file_hash(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def report(check, codes=(), unknown=False, **metrics):
    return {"schema": "entrus-pm/report/1", "engine": VERSION, "check": check,
            "status": "UNKNOWN" if unknown else ("BLOCKED" if codes else "PASS"),
            "codes": sorted(set(codes)), "metrics": metrics,
            "authority": "observe_and_gate_only", "financial_authority": "none"}


def release_gate(policy, request, root: Path, clock=None):
    clock = clock or now_utc()
    codes = []
    if policy.get("schema") != "entrus-pm/policy/1" or request.get("schema") != "entrus-pm/release/1":
        raise Invalid("SCHEMA_MISMATCH")
    if request.get("stage") not in STAGES:
        raise Invalid("INVALID_STAGE")
    target_id = request.get("target")
    targets = policy.get("targets", [])
    if not isinstance(targets, list) or len({t["id"] for t in targets}) != len(targets):
        raise Invalid("DUPLICATE_TARGET")
    target = next((t for t in targets if t["id"] == target_id), None)
    if not target:
        return report("release", ["TARGET_NOT_ENROLLED"])
    scope = request.get("scope", {})
    if target.get("deployment_mapping_verified") is not True and request["stage"] != "engineering":
        codes.append("DEPLOYMENT_MAPPING_UNVERIFIED")
    for k in ("repository", "branch", "environment", "service"):
        if not isinstance(scope.get(k), str) or not scope[k] or scope[k] != target.get(k):
            codes.append("TARGET_IDENTITY_MISMATCH")
    if not COMMIT.fullmatch(scope.get("commit", "")) or not HEX64.fullmatch(scope.get("artifact_sha256", "")):
        codes.append("RELEASE_IDENTITY_INVALID")
    if request.get("financial_authority") != "none" or request.get("private_data_export") is not False:
        codes.append("AUTHORITY_BOUNDARY_VIOLATION")
    artifact = bounded_path(root, request["artifact"])
    if not artifact.is_file() or file_hash(artifact) != scope.get("artifact_sha256"):
        codes.append("ARTIFACT_HASH_MISMATCH")
    receipts = request.get("receipts", [])
    if not isinstance(receipts, list) or len(receipts) > 100:
        raise Invalid("RECEIPTS_INVALID")
    by_kind = {}
    for ref in receipts:
        path = bounded_path(root, ref["path"])
        if not HEX64.fullmatch(ref.get("sha256", "")) or not path.is_file() or file_hash(path) != ref["sha256"]:
            codes.append("RECEIPT_HASH_MISMATCH")
            continue
        receipt = read_json(path)
        kind = receipt.get("kind")
        if kind in by_kind:
            codes.append("DUPLICATE_RECEIPT_KIND")
        by_kind[kind] = receipt
    for kind in KINDS[request["stage"]]:
        r = by_kind.get(kind)
        if not r:
            codes.append("MISSING_" + kind.upper() + "_EVIDENCE")
            continue
        if r.get("schema") != "entrus-pm/evidence/1" or r.get("status") != "PASS" or r.get("scope") != scope:
            codes.append("INVALID_" + kind.upper() + "_EVIDENCE")
        if r.get("collector") not in target.get("collectors", []):
            codes.append("UNTRUSTED_COLLECTOR")
        if not isinstance(r.get("checks"), list) or not r["checks"] or any(c.get("status") != "PASS" for c in r["checks"]):
            codes.append("INCOMPLETE_CHECK_EVIDENCE")
        age = (clock - instant(r.get("observed_at"))).total_seconds()
        ttl = policy.get("evidence_max_age_seconds", {}).get(kind)
        if type(ttl) is not int or ttl <= 0:
            raise Invalid("EVIDENCE_TTL_REQUIRED")
        if age < -60 or age > ttl:
            codes.append("STALE_OR_FUTURE_" + kind.upper() + "_EVIDENCE")
        if kind in ("deployment", "customer") and r.get("mode") != "live":
            codes.append("LIVE_EVIDENCE_REQUIRED")
        if kind in ("deployment", "customer") and not r.get("correlation_id"):
            codes.append("CORRELATION_REQUIRED")
        if kind == "authorization" and (r.get("action") != "promote_exact_release" or instant(r.get("expires_at")) <= clock):
            codes.append("PROMOTION_AUTHORIZATION_INVALID")
        if kind == "rollback" and (not HEX64.fullmatch(r.get("rollback_sha256", "")) or r.get("restore_verified") is not True):
            codes.append("ROLLBACK_UNPROVEN")
    if request.get("stage") == "customer":
        d, c = by_kind.get("deployment", {}), by_kind.get("customer", {})
        if d.get("correlation_id") != c.get("correlation_id"):
            codes.append("DEPLOYMENT_CUSTOMER_LINK_MISMATCH")
    return report("release", codes, stage=request["stage"], receipts=len(receipts),
                  scope_sha256=digest(canonical(scope)))


def reuse(accepted, proposed, clock=None):
    clock = clock or now_utc()
    fields = ("product", "feature", "environment", "release_identity", "dependency_fingerprint")
    if accepted.get("status") != "PASS" or not HEX64.fullmatch(accepted.get("receipt_sha256", "")):
        raise Invalid("ACCEPTANCE_NOT_ESTABLISHED")
    if (instant(accepted.get("accepted_at")) - clock).total_seconds() > 60:
        raise Invalid("ACCEPTANCE_TIMESTAMP_IN_FUTURE")
    if any(not isinstance(x.get(k), str) or not x[k] for x in (accepted, proposed) for k in fields):
        raise Invalid("ACCEPTANCE_SCOPE_MISSING")
    changed = sum(accepted[k] != proposed[k] for k in fields)
    contradiction = HEX64.fullmatch(proposed.get("contradiction_sha256", "")) is not None
    expired = "expires_at" in accepted and instant(accepted["expires_at"]) <= clock
    if changed or contradiction or expired:
        decision = "TARGETED_RECHECK_REQUIRED"
    elif proposed.get("access_available") is False:
        decision = "ACCESS_LIMITATION_ONLY"
    else:
        decision = "REUSE_ACCEPTANCE"
    return report("reuse", decision=decision, changed_fields=changed, historical_pass_preserved=True,
                  current_runtime_proven=False)


def cloudrun_delta(baseline, candidate):
    """V1 Revision spec + selected metadata, plus separate whole service-control snapshots.

    Only single-container names with no dependency annotation are cosmetic. Image
    is a reported release change, never silently ignored. No environment values output.
    """
    codes = []
    normalized = []
    images = []
    for doc in (baseline, candidate):
        if doc.get("kind") != "Revision" or doc.get("apiVersion") != "serving.knative.dev/v1":
            raise Invalid("UNSUPPORTED_CLOUDRUN_SHAPE")
        spec = copy.deepcopy(doc["spec"])
        containers = spec.get("containers")
        if not isinstance(containers, list) or len(containers) != 1:
            return report("cloudrun_delta", ["SIDECAR_REQUIRES_EXPLICIT_REVIEW"])
        ann = copy.deepcopy(doc.get("metadata", {}).get("annotations", {}))
        if "run.googleapis.com/container-dependencies" in ann:
            return report("cloudrun_delta", ["CONTAINER_NAME_DEPENDENCY"])
        for key in ("run.googleapis.com/operation-id", "run.googleapis.com/client-name", "run.googleapis.com/client-version", "serving.knative.dev/creator", "serving.knative.dev/lastModifier"):
            ann.pop(key, None)
        labels = copy.deepcopy(doc.get("metadata", {}).get("labels", {}))
        for key in ("serving.knative.dev/configuration", "serving.knative.dev/configurationGeneration", "serving.knative.dev/service", "serving.knative.dev/serviceUid", "serving.knative.dev/route", "cloud.googleapis.com/location", "run.googleapis.com/startupProbeType"):
            labels.pop(key, None)
        containers[0].pop("name", None)
        image = containers[0].pop("image", None)
        if not isinstance(image, str) or not re.search(r"@sha256:[0-9a-f]{64}$", image):
            codes.append("IMAGE_DIGEST_REQUIRED")
        images.append(image)
        normalized.append({"spec": spec, "annotations": ann, "labels": labels})
    # JSON pointer values/names may themselves carry secrets. Output only fixed categories/counts.
    for key in ("spec", "annotations", "labels"):
        if normalized[0][key] != normalized[1][key]:
            codes.append("MATERIAL_" + key.upper() + "_DIFFERENCE")
    return report("cloudrun_delta", codes, image_changed=images[0] != images[1],
                  service_level_controls="SEPARATE_EVIDENCE_REQUIRED", promotion_authorized=False)


def archive_check(path: Path, expected: str):
    codes = []
    if not HEX64.fullmatch(expected) or file_hash(path) != expected:
        return report("archive", ["PACKAGE_HASH_MISMATCH"])
    seen, total = set(), 0
    files, directories = set(), set()
    with zipfile.ZipFile(path) as z:
        entries = z.infolist()
        if len(entries) > 20000:
            return report("archive", ["ARCHIVE_ENTRY_LIMIT"])
        for entry in entries:
            name = entry.filename.rstrip("/")
            if any(part.endswith((".", " ")) or re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)", part, re.I) for part in name.split("/")):
                codes.append("UNSAFE_ARCHIVE_PATH")
            try:
                bounded_path(Path.cwd(), name)
            except (Invalid, OSError, ValueError):
                codes.append("UNSAFE_ARCHIVE_PATH")
            if name.casefold() in seen:
                codes.append("DUPLICATE_ARCHIVE_PATH")
            seen.add(name.casefold())
            folded = name.casefold()
            parts = folded.split("/")
            parents = {"/".join(parts[:i]) for i in range(1, len(parts))}
            if (parents & files or
                    (entry.is_dir() and folded in files) or
                    (not entry.is_dir() and folded in directories)):
                codes.append("ARCHIVE_PATH_KIND_CONFLICT")
            directories.update(parents)
            if entry.is_dir():
                directories.add(folded)
            else:
                files.add(folded)
            if stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1:
                codes.append("LINK_OR_ENCRYPTED_ENTRY")
            total += entry.file_size
            if total > 256 * 1024 * 1024 or entry.file_size > 32 * 1024 * 1024:
                return report("archive", ["ARCHIVE_SIZE_LIMIT"])
            if re.search(r"(^|/)(\.pytest_cache|__pycache__|\.git|node_modules)(/|$)|\.(pyc|db|sqlite|sqlite3)(-wal|-shm)?$|(^|/)\.env($|\.)", name, re.I):
                codes.append("PACKAGED_RUNTIME_OR_CACHE_RESIDUE")
        if z.testzip() is not None:
            codes.append("ZIP_CRC_FAILURE")
    return report("archive", codes, entries=len(entries), expanded_bytes=total)


SECRET = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-proj-|sk-live-|sk_live_)[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{30,}|\bgh[pousr]_[A-Za-z0-9]{30,}")


def scan(root: Path, paths):
    """Explicit tracked paths only. No crawling user folders, environment or credentials."""
    codes, count, locations = [], 0, []
    if not isinstance(paths, list) or len(paths) > 30000:
        raise Invalid("SCAN_PATHS_INVALID")
    for name in paths:
        p = bounded_path(root, name)
        if not p.exists():  # deleted tracked files have no new content
            continue
        if not p.is_file():
            raise Invalid("SCAN_NOT_FILE")
        if re.search(r"(^|/)(\.env($|\.(?!example$|sample$))|__pycache__/|\.pytest_cache/)|\.(sqlite3?|db|pyc)(-wal|-shm)?$", name, re.I):
            codes.append("TRACKED_STATE_OR_CREDENTIAL_FILE")
            locations.append(digest(name.encode()))
        if p.stat().st_size > MAX_INPUT:
            codes.append("SCAN_FILE_TOO_LARGE_UNCHECKED")
            continue
        count += 1
        if SECRET.search(p.read_bytes()):
            codes.append("POSSIBLE_SECRET_LITERAL")
            locations.append(digest(name.encode()))
    return report("scan", codes, checked_files=count, location_hashes=sorted(set(locations)),
                  coverage="limited_pattern_scan_not_DLP")


def fleet(policy, observations, clock=None):
    """Coverage is measured against enrolled targets; unknown targets never silently pass."""
    clock = clock or now_utc()
    targets = policy["targets"]
    if len({t["id"] for t in targets}) != len(targets):
        raise Invalid("DUPLICATE_TARGET")
    ids = [o["target"] for o in observations]
    if len(set(ids)) != len(ids):
        raise Invalid("DUPLICATE_OBSERVATION")
    codes, ok = [], 0
    if not targets or policy.get("inventory_complete") is not True:
        codes.append("FLEET_INVENTORY_INCOMPLETE")
    if set(ids) - {t["id"] for t in targets}:
        codes.append("UNENROLLED_OBSERVATION")
    for t in targets:
        if t.get("deployment_mapping_verified") is not True:
            codes.append("DEPLOYMENT_MAPPING_UNVERIFIED")
            continue
        o = next((o for o in observations if o["target"] == t["id"]), None)
        if not o or o.get("access") != "available":
            codes.append("TARGET_UNOBSERVED")
            continue
        age = (clock - instant(o["observed_at"])).total_seconds()
        if age < -60 or age > policy["runtime_max_age_seconds"]:
            codes.append("RUNTIME_OBSERVATION_STALE")
        elif o.get("service") != t.get("service") or o.get("branch") != t.get("branch"):
            codes.append("RUNTIME_IDENTITY_MISMATCH")
        elif o.get("engine_version") != VERSION or o.get("gate_enforced") is not True:
            codes.append("ENFORCEMENT_UNPROVEN")
        else:
            ok += 1
    return report("fleet", codes, enrolled=len(targets), enforced_observed=ok,
                  inventory_complete=policy.get("inventory_complete") is True)


def contract(payload):
    """Strict public quote/evidence contract probe, not a general privacy sanitizer.

    Rejects extra fields at every level; no arbitrary prose or private identifiers
    can pass this narrowly typed wire contract. It does not replace app privacy tests.
    """
    import math
    codes = []
    if set(payload) != {"schema", "observations", "claims", "financial_authority"} or payload.get("schema") != "entrus-pm/public-contract/1":
        return report("contract", ["OUTBOUND_SCHEMA_REJECTED"])
    if payload["financial_authority"] != "none":
        codes.append("AUTHORITY_BOUNDARY_VIOLATION")
    if not isinstance(payload["observations"], list) or not isinstance(payload["claims"], list):
        raise Invalid("CONTRACT_LIST_REQUIRED")
    if len(payload["observations"]) > 100 or len(payload["claims"]) > 100:
        raise Invalid("CONTRACT_SIZE_LIMIT")
    aliases = set()
    for observation in payload["observations"]:
        if set(observation) != {"alias", "asset", "quote", "observed_at", "last", "bid", "ask"}:
            codes.append("OUTBOUND_SCHEMA_REJECTED")
            continue
        alias = observation["alias"]
        if not isinstance(alias, str) or not re.fullmatch(r"E[1-9][0-9]{0,5}", alias) or alias in aliases:
            codes.append("ALIAS_INVALID_OR_COLLISION")
        else:
            aliases.add(alias)
        if observation["asset"] not in ("BTC", "ETH", "XRP", "SOL") or observation["quote"] != "USD":
            codes.append("SUBJECT_NOT_ADMITTED")
        instant(observation["observed_at"])
        for key in ("last", "bid", "ask"):
            v = observation[key]
            if type(v) not in (int, float) or not math.isfinite(v) or v <= 0:
                codes.append("OBSERVATION_VALUE_INVALID")
    for claim in payload["claims"]:
        if set(claim) != {"aliases", "evidence_strength", "state"}:
            codes.append("OUTBOUND_SCHEMA_REJECTED")
            continue
        refs, strength = claim["aliases"], claim["evidence_strength"]
        if not isinstance(refs, list) or not refs or any(not isinstance(a, str) or a not in aliases for a in refs):
            codes.append("UNKNOWN_OR_MISSING_ALIAS")
        if type(strength) not in (int, float) or not math.isfinite(strength) or not 0 <= strength <= 100:
            codes.append("EVIDENCE_STRENGTH_INVALID")
        elif claim["state"] not in ("supported", "not_supported") or (strength < 75 and claim["state"] == "supported"):
            codes.append("UNSUPPORTED_CONFIDENCE_CLAIM")
    return report("contract", codes, observations=len(payload["observations"]), claims=len(payload["claims"]),
                  evidence_truth_independently_proven=False)


def write_receipt(directory: Path, result):
    """Exclusive lock + immutable-by-convention entries; no secret or caller strings.

    Crash leaves lock in place: reconcile manually, do not blindly clear. Not a
    multi-host lock nor a replacement for external append-only retention.
    """
    directory.mkdir(parents=True, exist_ok=True)
    lock = directory / ".writer.lock"
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        os.close(fd)
        previous = verify_receipts(directory)
        if previous["status"] != "PASS":
            raise Invalid("RECEIPT_CHAIN_INVALID")
        seq = previous["metrics"]["entries"] + 1
        event = {"sequence": seq, "previous": previous["metrics"]["head"],
                 "recorded_at": now_utc().isoformat(), "report": result}
        data = canonical(event)
        p = directory / f"{seq:08d}.json"
        with p.open("xb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        return {"sequence": seq, "sha256": digest(data)}
    finally:
        lock.unlink()


def verify_receipts(directory: Path, expected_head=None):
    previous, count = "0" * 64, 0
    for p in sorted(directory.glob("*.json")):
        count += 1
        if p.name != f"{count:08d}.json":
            return report("receipt_chain", ["CHAIN_SEQUENCE_INVALID"])
        item = read_json(p)
        if item.get("sequence") != count or item.get("previous") != previous:
            return report("receipt_chain", ["CHAIN_LINK_INVALID"])
        previous = file_hash(p)
    if expected_head is not None and previous != expected_head:
        return report("receipt_chain", ["CHAIN_ANCHOR_MISMATCH"])
    return report("receipt_chain", entries=count, head=previous, externally_anchored=expected_head is not None)
