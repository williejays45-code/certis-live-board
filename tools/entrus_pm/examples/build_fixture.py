"""Create fresh synthetic engineering evidence; refuses an existing output folder."""
from pathlib import Path
import json
import sys
from datetime import datetime, timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pm import engine as e


def create(root):
    root.mkdir(parents=True, exist_ok=False)
    artifact=root/"synthetic.txt";artifact.write_bytes(b"SYNTHETIC ENGINEERING ARTIFACT\n")
    scope=dict(repository="synthetic/example",branch="test",environment="isolated",service="fixture",commit="a"*40,artifact_sha256=e.file_hash(artifact))
    policy=dict(schema="entrus-pm/policy/1",targets=[dict(id="fixture",collectors=["synthetic-test"],deployment_mapping_verified=False,**{k:v for k,v in scope.items() if k not in ("commit","artifact_sha256")})],evidence_max_age_seconds={k:3600 for k in e.KINDS["engineering"]})
    request=dict(schema="entrus-pm/release/1",stage="engineering",target="fixture",scope=scope,artifact=artifact.name,financial_authority="none",private_data_export=False,receipts=[])
    for kind in e.KINDS["engineering"]:
        data=dict(schema="entrus-pm/evidence/1",kind=kind,scope=scope,status="PASS",collector="synthetic-test",mode="synthetic",checks=[dict(status="PASS",name="fixture-only")],observed_at=datetime.now(timezone.utc).isoformat())
        p=root/(kind+".json");p.write_bytes(e.canonical(data))
        request["receipts"].append(dict(path=p.name,sha256=e.file_hash(p)))
    (root/"policy.json").write_bytes(e.canonical(policy));(root/"release.json").write_bytes(e.canonical(request))
    print(json.dumps(dict(fixture="SYNTHETIC_ONLY",policy_sha256=e.file_hash(root/"policy.json"))))


if __name__=="__main__":create(Path(sys.argv[1]))
