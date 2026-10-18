"""Actual git producer -> CI runner -> exit-code contract, all synthetic/offline."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class CITests(unittest.TestCase):
    def setUp(self):
        self.source=Path(__file__).resolve().parents[1]
        temp_root=self.source/".test-tmp";temp_root.mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=temp_root);self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/"repo";self.root.mkdir()
        self.git("init","--template=","-b","main")
        (self.root/"readme.txt").write_text("base")
        self.git("add","readme.txt");self.git("-c","user.name=Synthetic","-c","user.email=test@example.invalid","commit","-m","base")
        self.base=self.git("rev-parse","HEAD").strip()
        self.git("update-ref","refs/remotes/origin/main",self.base)
        shutil.copytree(self.source/"pm",self.root/"pm",ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copyfile(self.source/"ci.py",self.root/"ci.py")

    def git(self,*args):
        return subprocess.run(["git","-C",str(self.root),*args],check=True,capture_output=True,text=True,timeout=30).stdout

    def run_ci(self, event, name="pull_request"):
        self.git("add",".");self.git("-c","user.name=Synthetic","-c","user.email=test@example.invalid","commit","-m","candidate")
        p=self.root.parent/"event.json";p.write_text(json.dumps(event),encoding="utf-8")
        env=os.environ.copy();env.update(GITHUB_EVENT_NAME=name,GITHUB_EVENT_PATH=str(p))
        return subprocess.run([sys.executable,"-B","ci.py"],cwd=self.root,env=env,capture_output=True,text=True,timeout=30)

    def test_actual_clean_pr_diff_passes(self):
        r=self.run_ci({"pull_request":{"base":{"sha":self.base}}})
        self.assertEqual(r.returncode,0,r.stdout)
        self.assertEqual(json.loads(r.stdout)["metrics"]["scan_scope"],"changed_files")

    def test_secret_in_new_file_blocks(self):
        token="sk-"+"proj-"+"a"*30
        (self.root/"fixture.txt").write_text(token)
        r=self.run_ci({"pull_request":{"base":{"sha":self.base}}})
        self.assertEqual(r.returncode,1)
        self.assertNotIn(token,r.stdout+r.stderr)

    def test_existing_unmodified_finding_not_reopened(self):
        (self.root/"old.db").write_bytes(b"historical fixture")
        self.git("add","old.db");self.git("-c","user.name=Synthetic","-c","user.email=test@example.invalid","commit","-m","historical")
        base=self.git("rev-parse","HEAD").strip()
        r=self.run_ci({"pull_request":{"base":{"sha":base}}})
        self.assertEqual(r.returncode,0,r.stdout)

    def test_new_branch_scans_against_default(self):
        r=self.run_ci({"before":"0"*40,"repository":{"default_branch":"main"}},"push")
        self.assertEqual(r.returncode,0,r.stdout)

    def test_unknown_base_cannot_pass(self):
        r=self.run_ci({"pull_request":{"base":{"sha":"f"*40}}})
        self.assertEqual(r.returncode,2)

    def test_option_injection_is_rejected(self):
        r=self.run_ci({"pull_request":{"base":{"sha":"--help"}}})
        self.assertEqual(r.returncode,2)


if __name__=="__main__":unittest.main()
