"""Reproducible source ZIP, independent unpacked tests, evidence and integrations.

No downloads, credentials, application tests, live APIs or paid calls. Refuses to
overwrite a previous release directory. The source manifest excludes local audit
data and operational discovery so those are not published into public repositories.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import sys
import zipfile
from pm import engine as e

ROOT=Path(__file__).resolve().parent
FILES=[".gitignore","README.md","ci.py","build_release.py","pm/__init__.py","pm/__main__.py","pm/engine.py",
       "tests/test_engine.py","tests/test_ci.py","tests/test_git_modes.py","examples/build_fixture.py","config/fleet-policy.json",
       "integration/entrus-maintenance.yml","docs/CONTROL_COVERAGE.md","docs/ROLLOUT.md",
       "docs/SOFTWARE.md","docs/CHATGPT_REVIEW_HANDOFF.md","docs/DIAGNOSTICS.md","docs/GIT_MODE_FOLLOWUP.md"]


def main():
    build_id=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest=ROOT/"dist"/("entrus-pm-"+e.VERSION+"-"+build_id)
    dest.mkdir(parents=True,exist_ok=False)
    test=subprocess.run([sys.executable,"-B","-m","unittest","discover","-s","tests","-v"],cwd=ROOT,capture_output=True,text=True,timeout=120)
    (dest/"TESTS.log").write_text(test.stdout+test.stderr,encoding="utf-8")
    if test.returncode:raise RuntimeError("TESTS_FAILED")
    manifest={n:e.file_hash(ROOT/n) for n in FILES}
    (dest/"SOURCE_MANIFEST.json").write_bytes(e.canonical(manifest))
    zip_path=dest/("entrus-preventive-maintenance-"+e.VERSION+".zip")
    with zipfile.ZipFile(zip_path,"x",compression=zipfile.ZIP_DEFLATED) as z:
        for n in sorted(FILES):
            info=zipfile.ZipInfo(n,date_time=(2026,10,17,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.create_system=0  # Preserve the original package's creator metadata on every host.
            info.external_attr=0o100644<<16
            z.writestr(info,(ROOT/n).read_bytes())
    archive=e.archive_check(zip_path,e.file_hash(zip_path))
    if archive["status"]!="PASS":raise RuntimeError("PACKAGE_CHECK_FAILED")
    unpack=dest/"package-smoke";unpack.mkdir()
    with zipfile.ZipFile(zip_path) as z:
        for n in FILES:
            p=e.bounded_path(unpack,n);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(n))
    if any(e.file_hash(unpack/n)!=sha for n,sha in manifest.items()):raise RuntimeError("UNPACK_HASH_FAILED")
    smoke=subprocess.run([sys.executable,"-B","-m","unittest","discover","-s","tests","-v"],cwd=unpack,capture_output=True,text=True,timeout=120)
    (dest/"PACKAGE_SMOKE.log").write_text(smoke.stdout+smoke.stderr,encoding="utf-8")
    if smoke.returncode:raise RuntimeError("PACKAGE_SMOKE_FAILED")
    fixture=dest/"synthetic-engineering"
    prep=subprocess.run([sys.executable,"-B","examples/build_fixture.py",str(fixture)],cwd=unpack,capture_output=True,text=True,timeout=30)
    if prep.returncode:raise RuntimeError("FIXTURE_GENERATION_FAILED")
    command=[sys.executable,"-B","-m","pm","release","--root",str(fixture),"--policy",str(fixture/"policy.json"),"--policy-sha256",e.file_hash(fixture/"policy.json"),"--input",str(fixture/"release.json")]
    positive=subprocess.run(command,cwd=unpack,capture_output=True,text=True,timeout=30)
    request=e.read_json(fixture/"release.json");request["stage"]="customer";(fixture/"release.json").write_bytes(e.canonical(request))
    negative=subprocess.run(command,cwd=unpack,capture_output=True,text=True,timeout=30)
    if positive.returncode!=0 or negative.returncode!=1:raise RuntimeError("CLI_BOUNDARY_FAILED")
    (dest/"CLI_SMOKE.json").write_bytes(e.canonical({"engineering_fixture":json.loads(positive.stdout),"customer_claim_rejected":json.loads(negative.stdout)}))
    (dest/"FLEET_STATUS.json").write_bytes(e.canonical(e.fleet(e.read_json(ROOT/"config/fleet-policy.json"),[])))
    payload=[]
    for n in FILES:
        payload.append(dict(path="tools/entrus_pm/"+n,mode="100644",type="blob",content=(ROOT/n).read_text(encoding="utf-8")))
    payload.append(dict(path=".github/workflows/entrus-maintenance.yml",mode="100644",type="blob",content=(ROOT/"integration/entrus-maintenance.yml").read_text(encoding="utf-8")))
    (dest/"INTEGRATION_TREE.json").write_text(json.dumps(payload,ensure_ascii=False),encoding="utf-8")
    receipt=dict(schema="entrus-pm/build-receipt/1",version=e.VERSION,build_id=build_id,recorded_at=datetime.now(timezone.utc).isoformat(),
                 status="ENGINEERING_CANDIDATE_PASS",package_sha256=e.file_hash(zip_path),files=len(FILES),
                 local_tests="PASS",unpacked_tests="PASS",cli_positive_negative="PASS",archive=archive,
                 production_enforcement="NOT_INSTALLED",all_live_system_coverage="UNPROVEN",
                 financial_authority="none",model_calls=0,paid_tests=0,
                 evidence_hashes={p.name:e.file_hash(p) for p in dest.iterdir() if p.is_file()})
    (dest/"BUILD_RECEIPT.json").write_bytes(e.canonical(receipt))
    print(json.dumps({"status":receipt["status"],"build_id":build_id,"package_sha256":receipt["package_sha256"],"files":len(FILES),"production_enforcement":receipt["production_enforcement"]}))


if __name__=="__main__":main()
