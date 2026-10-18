import copy
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

from pm import engine as e

NOW = datetime(2026, 10, 17, 12, tzinfo=timezone.utc)


class EngineTests(unittest.TestCase):
    def setUp(self):
        temp_root = Path.cwd() / ".test-tmp"
        temp_root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=temp_root)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.scope = dict(repository="example/product", branch="main", environment="test", service="svc", commit="a"*40, artifact_sha256=e.digest(b"artifact"))
        (self.root / "artifact.bin").write_bytes(b"artifact")
        self.policy = dict(schema="entrus-pm/policy/1", inventory_complete=True, runtime_max_age_seconds=300,
                           evidence_max_age_seconds={k: 3600 for k in e.KINDS["customer"]},
                           targets=[dict(id="test", collectors=["ci"], deployment_mapping_verified=True,
                                         **{k:v for k,v in self.scope.items() if k not in ("commit", "artifact_sha256")})])
        self.request = dict(schema="entrus-pm/release/1", target="test", scope=self.scope, artifact="artifact.bin",
                            financial_authority="none", private_data_export=False, stage="customer", receipts=[])
        for kind in e.KINDS["customer"]:
            r = dict(schema="entrus-pm/evidence/1", kind=kind, scope=self.scope, status="PASS", collector="ci", checks=[dict(status="PASS")], observed_at=NOW.isoformat(), mode="live", correlation_id="run-1")
            if kind == "authorization":
                r.update(action="promote_exact_release", expires_at=(NOW+timedelta(hours=1)).isoformat())
            if kind == "rollback":
                r.update(rollback_sha256="b"*64, restore_verified=True)
            self.put(kind, r)

    def put(self, kind, r):
        path = self.root / (kind + ".json")
        path.write_bytes(e.canonical(r))
        self.request["receipts"] = [v for v in self.request["receipts"] if v["path"] != path.name]
        self.request["receipts"].append(dict(path=path.name, sha256=e.file_hash(path)))

    def change(self, kind, **values):
        r = e.read_json(self.root / (kind+".json"))
        r.update(values)
        self.put(kind, r)

    def gate(self):
        return e.release_gate(self.policy, self.request, self.root, NOW)

    def test_complete_scoped_evidence_passes(self):
        self.assertEqual(self.gate()["status"], "PASS")

    def test_missing_customer_evidence_blocks(self):
        self.request["receipts"] = self.request["receipts"][:-1]
        self.assertIn("MISSING_CUSTOMER_EVIDENCE", self.gate()["codes"])

    def test_unit_test_cannot_prove_customer(self):
        self.change("customer", mode="synthetic")
        self.assertIn("LIVE_EVIDENCE_REQUIRED", self.gate()["codes"])

    def test_hash_tampering_blocks(self):
        (self.root / "tests.json").write_text("{}")
        self.assertIn("RECEIPT_HASH_MISMATCH", self.gate()["codes"])

    def test_wrong_commit_blocks(self):
        self.change("deployment", scope={**self.scope, "commit":"c"*40})
        self.assertIn("INVALID_DEPLOYMENT_EVIDENCE", self.gate()["codes"])

    def test_wrong_target_blocks(self):
        self.request["scope"] = {**self.scope, "service":"other"}
        self.assertIn("TARGET_IDENTITY_MISMATCH", self.gate()["codes"])

    def test_unenrolled_target_blocks(self):
        self.request["target"] = "unknown"
        self.assertEqual(self.gate()["codes"], ["TARGET_NOT_ENROLLED"])

    def test_artifact_mutation_blocks(self):
        (self.root / "artifact.bin").write_bytes(b"changed")
        self.assertIn("ARTIFACT_HASH_MISMATCH", self.gate()["codes"])

    def test_authority_expansion_blocks(self):
        self.request["financial_authority"] = "trading"
        self.assertIn("AUTHORITY_BOUNDARY_VIOLATION", self.gate()["codes"])

    def test_private_export_blocks(self):
        self.request["private_data_export"] = True
        self.assertIn("AUTHORITY_BOUNDARY_VIOLATION", self.gate()["codes"])

    def test_expired_approval_blocks(self):
        self.change("authorization", expires_at=NOW.isoformat())
        self.assertIn("PROMOTION_AUTHORIZATION_INVALID", self.gate()["codes"])

    def test_unverified_restore_blocks(self):
        self.change("rollback", restore_verified=False)
        self.assertIn("ROLLBACK_UNPROVEN", self.gate()["codes"])

    def test_stale_evidence_blocks(self):
        self.change("deployment", observed_at=(NOW-timedelta(hours=2)).isoformat())
        self.assertIn("STALE_OR_FUTURE_DEPLOYMENT_EVIDENCE", self.gate()["codes"])

    def test_future_evidence_blocks(self):
        self.change("deployment", observed_at=(NOW+timedelta(minutes=5)).isoformat())
        self.assertIn("STALE_OR_FUTURE_DEPLOYMENT_EVIDENCE", self.gate()["codes"])

    def test_unknown_outcome_never_passes(self):
        self.change("deployment", status="UNKNOWN")
        self.assertIn("INVALID_DEPLOYMENT_EVIDENCE", self.gate()["codes"])

    def test_collector_not_admitted(self):
        self.change("tests", collector="caller")
        self.assertIn("UNTRUSTED_COLLECTOR", self.gate()["codes"])

    def test_duplicate_receipt_blocks(self):
        self.request["receipts"].append(self.request["receipts"][0])
        self.assertIn("DUPLICATE_RECEIPT_KIND", self.gate()["codes"])

    def test_failed_child_check_blocks(self):
        self.change("tests", checks=[dict(status="FAIL")])
        self.assertIn("INCOMPLETE_CHECK_EVIDENCE", self.gate()["codes"])

    def test_unmapped_deployment_blocks(self):
        self.policy["targets"][0]["deployment_mapping_verified"] = False
        self.assertIn("DEPLOYMENT_MAPPING_UNVERIFIED", self.gate()["codes"])

    def test_customer_correlates_deployment(self):
        self.change("customer", correlation_id="other")
        self.assertIn("DEPLOYMENT_CUSTOMER_LINK_MISMATCH", self.gate()["codes"])

    def test_engineering_is_separate(self):
        self.request["stage"] = "engineering"
        self.request["receipts"] = self.request["receipts"][:3]
        self.assertEqual(self.gate()["status"], "PASS")
        self.request["stage"] = "promotion"
        self.assertEqual(self.gate()["status"], "BLOCKED")

    def acceptance(self):
        return dict(product="CERTIS", feature="auth", environment="prod", release_identity="r1", dependency_fingerprint="d1", status="PASS", receipt_sha256="a"*64, accepted_at=NOW.isoformat())

    def test_reuse_unchanged_gate(self):
        a=self.acceptance()
        self.assertEqual(e.reuse(a,a,NOW)["metrics"]["decision"], "REUSE_ACCEPTANCE")

    def test_access_failure_preserves_acceptance(self):
        a=self.acceptance()
        r=e.reuse(a,{**a,"access_available":False},NOW)
        self.assertEqual(r["metrics"]["decision"], "ACCESS_LIMITATION_ONLY")
        self.assertTrue(r["metrics"]["historical_pass_preserved"])

    def test_changed_dependency_wins_over_access_failure(self):
        a=self.acceptance()
        r=e.reuse(a,{**a,"access_available":False,"dependency_fingerprint":"new"},NOW)
        self.assertEqual(r["metrics"]["decision"], "TARGETED_RECHECK_REQUIRED")

    def test_expiring_acceptance_requires_scoped_refresh(self):
        a=self.acceptance();a["expires_at"]=NOW.isoformat()
        self.assertEqual(e.reuse(a,a,NOW)["metrics"]["decision"], "TARGETED_RECHECK_REQUIRED")

    def revision(self):
        return dict(apiVersion="serving.knative.dev/v1",kind="Revision",metadata=dict(name="r1",annotations={"run.googleapis.com/operation-id":"op1"}),spec=dict(serviceAccountName="runtime",containerConcurrency=10,containers=[dict(name="old",image="registry/image@sha256:"+"a"*64,env=[dict(name="SECRET",value="do-not-print")])]))

    def test_cosmetic_name_and_operation_id_allowed(self):
        a=self.revision();b=copy.deepcopy(a)
        b["metadata"]["annotations"]["run.googleapis.com/operation-id"]="op2"
        b["spec"]["containers"][0]["name"]="new"
        r=e.cloudrun_delta(a,b)
        self.assertEqual(r["status"],"PASS")
        self.assertNotIn("do-not-print",json.dumps(r))

    def test_env_change_blocks_without_value_leak(self):
        a=self.revision();b=copy.deepcopy(a)
        b["spec"]["containers"][0]["env"][0]["value"]="second-secret"
        r=e.cloudrun_delta(a,b)
        self.assertEqual(r["codes"],["MATERIAL_SPEC_DIFFERENCE"])
        self.assertNotIn("second-secret",json.dumps(r))

    def test_service_account_drift_blocks(self):
        a=self.revision();b=copy.deepcopy(a);b["spec"]["serviceAccountName"]="admin"
        self.assertEqual(e.cloudrun_delta(a,b)["status"],"BLOCKED")

    def test_sidecar_name_is_not_normalized(self):
        a=self.revision();a["spec"]["containers"].append(dict(name="sidecar"))
        self.assertEqual(e.cloudrun_delta(a,a)["codes"],["SIDECAR_REQUIRES_EXPLICIT_REVIEW"])

    def test_container_dependencies_not_normalized(self):
        a=self.revision();a["metadata"]["annotations"]["run.googleapis.com/container-dependencies"]="{}"
        self.assertEqual(e.cloudrun_delta(a,a)["codes"],["CONTAINER_NAME_DEPENDENCY"])

    def test_mutable_image_tag_blocks(self):
        a=self.revision();a["spec"]["containers"][0]["image"]="image:latest"
        self.assertIn("IMAGE_DIGEST_REQUIRED",e.cloudrun_delta(a,a)["codes"])

    def zip_result(self, names):
        p=self.root/"test.zip"
        with zipfile.ZipFile(p,"w") as z:
            for name in names:z.writestr(name,b"content")
        return e.archive_check(p,e.file_hash(p))

    def test_zip_clean(self):
        self.assertEqual(self.zip_result(["src/app.py"])["status"],"PASS")

    def test_zip_traversal(self):
        self.assertIn("UNSAFE_ARCHIVE_PATH",self.zip_result(["../secret"])["codes"])

    def test_zip_windows_reserved(self):
        self.assertIn("UNSAFE_ARCHIVE_PATH",self.zip_result(["NUL.txt"])["codes"])

    def test_zip_case_collision(self):
        self.assertIn("DUPLICATE_ARCHIVE_PATH",self.zip_result(["A.py","a.py"])["codes"])

    def test_zip_runtime_residue(self):
        self.assertIn("PACKAGED_RUNTIME_OR_CACHE_RESIDUE",self.zip_result(["state.sqlite-wal"])["codes"])

    def test_duplicate_json_keys_rejected(self):
        p=self.root/"bad.json";p.write_text('{"status":"FAIL","status":"PASS"}')
        with self.assertRaises(e.Invalid):e.read_json(p)

    def test_nonfinite_json_rejected(self):
        p=self.root/"bad.json";p.write_text('{"v":NaN}')
        with self.assertRaises(e.Invalid):e.read_json(p)

    def test_input_path_escape_rejected(self):
        for path in ("../out","C:/file","/etc/file","a\\b","a//b"):
            with self.subTest(path=path),self.assertRaises(e.Invalid):e.bounded_path(self.root,path)

    def test_scan_secret_redacted(self):
        token="sk-"+"proj-"+"X"*30
        (self.root/"code.txt").write_text(token)
        r=e.scan(self.root,["code.txt"])
        self.assertIn("POSSIBLE_SECRET_LITERAL",r["codes"])
        self.assertNotIn(token,json.dumps(r))

    def test_missing_fleet_target_does_not_pass(self):
        self.assertEqual(e.fleet(self.policy,[],NOW)["status"],"BLOCKED")

    def test_incomplete_inventory_never_claims_coverage(self):
        p={**self.policy,"inventory_complete":False,"targets":[]}
        self.assertIn("FLEET_INVENTORY_INCOMPLETE",e.fleet(p,[],NOW)["codes"])

    def test_stale_fleet_observation(self):
        o=dict(target="test",access="available",observed_at=(NOW-timedelta(hours=1)).isoformat(),service="svc",branch="main",engine_version=e.VERSION,gate_enforced=True)
        self.assertIn("RUNTIME_OBSERVATION_STALE",e.fleet(self.policy,[o],NOW)["codes"])

    def test_receipt_chain_tamper_detected_with_anchor(self):
        d=self.root/"ledger"
        a=e.write_receipt(d,e.report("synthetic"))
        self.assertEqual(e.verify_receipts(d,a["sha256"])["status"],"PASS")
        p=d/"00000001.json";r=e.read_json(p);r["report"]["status"]="FAIL";p.write_bytes(e.canonical(r))
        self.assertEqual(e.verify_receipts(d,a["sha256"])["status"],"BLOCKED")

    def test_receipt_lock_refuses_overlapping_writer(self):
        d=self.root/"ledger";d.mkdir();(d/".writer.lock").write_text("locked")
        with self.assertRaises(FileExistsError):e.write_receipt(d,e.report("synthetic"))

    def public(self):
        return dict(schema="entrus-pm/public-contract/1", financial_authority="none",observations=[dict(alias="E1",asset="BTC",quote="USD",observed_at=NOW.isoformat(),last=1,bid=1,ask=1)],claims=[dict(aliases=["E1"],evidence_strength=75,state="supported")])

    def test_public_contract(self):
        self.assertEqual(e.contract(self.public())["status"],"PASS")

    def test_numeric_account_key_rejected(self):
        p=self.public();p["observations"][0]["accountNumber"]=1234567890
        self.assertIn("OUTBOUND_SCHEMA_REJECTED",e.contract(p)["codes"])

    def test_sensitive_key_rejected(self):
        p=self.public();p["observations"][0]["person@example.test"]="private"
        r=e.contract(p);self.assertIn("OUTBOUND_SCHEMA_REJECTED",r["codes"])
        self.assertNotIn("person@",json.dumps(r))

    def test_identifier_list_rejected(self):
        p=self.public();p["claims"][0]["aliases"]=[1234567890]
        self.assertIn("UNKNOWN_OR_MISSING_ALIAS",e.contract(p)["codes"])

    def test_alias_collision(self):
        p=self.public();p["observations"].append(p["observations"][0])
        self.assertIn("ALIAS_INVALID_OR_COLLISION",e.contract(p)["codes"])

    def test_unknown_alias(self):
        p=self.public();p["claims"][0]["aliases"]=["E2"]
        self.assertIn("UNKNOWN_OR_MISSING_ALIAS",e.contract(p)["codes"])

    def test_below_threshold_cannot_be_supported(self):
        p=self.public();p["claims"][0]["evidence_strength"]=74
        self.assertIn("UNSUPPORTED_CONFIDENCE_CLAIM",e.contract(p)["codes"])

    def test_cli_malformed_input_fails_closed_without_leak(self):
        p=self.root/"bad.json";p.write_text('SECRET_DO_NOT_ECHO')
        r=subprocess.run([sys.executable,"-B","-m","pm","contract","--input",str(p)],capture_output=True,text=True)
        self.assertEqual(r.returncode,2)
        self.assertNotIn("SECRET_DO_NOT_ECHO",r.stdout+r.stderr)

    def test_cli_wrong_policy_pin_fails(self):
        p=self.root/"policy.json";p.write_bytes(e.canonical(self.policy))
        r=subprocess.run([sys.executable,"-B","-m","pm","fleet","--policy",str(p),"--policy-sha256","0"*64,"--input",str(p)],capture_output=True,text=True)
        self.assertEqual(r.returncode,2)


if __name__ == "__main__":unittest.main()
