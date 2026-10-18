"""Independent review regressions; synthetic data and disposable Git repositories only."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from datetime import datetime, timezone
from pm import engine as e

class GitModeTests(unittest.TestCase):

    def setUp(self):
        self.source = Path(__file__).resolve().parents[1]
        tmp = self.source / '.test-tmp'
        tmp.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=tmp)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def git(self, *args, input=None):
        return subprocess.run(['git', '-C', str(self.root), *args], input=input, capture_output=True, text=True, check=True, timeout=30).stdout.strip()

    def commit(self):
        self.git('-c', 'user.name=Synthetic', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture')
        return self.git('rev-parse', 'HEAD')

    def repo(self):
        self.git('init', '--template=', '-b', 'main')
        self.git('config', 'core.symlinks', 'false')
        (self.root / 'tracked.txt').write_text('synthetic regular file')
        self.git('add', 'tracked.txt')
        base = self.commit()
        shutil.copytree(self.source / 'pm', self.root / 'pm', ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copyfile(self.source / 'ci.py', self.root / 'ci.py')
        return base

    def mode(self, mode, content='synthetic-link-target'):
        blob = self.git('hash-object', '-w', '--stdin', input=content)
        self.git('update-index', '--cacheinfo', mode + ',' + blob + ',tracked.txt')
        return self.commit()

    def runners(self, base, code):
        event = self.root / 'event.json'
        event.write_text(json.dumps({'pull_request': {'base': {'sha': base}}}))
        env = os.environ.copy()
        env.update(GITHUB_EVENT_NAME='pull_request', GITHUB_EVENT_PATH=str(event))
        for command in ([sys.executable, '-B', 'ci.py'], [sys.executable, '-B', '-m', 'pm', 'scan', '--base-ref', base]):
            with self.subTest(command=command[2]):
                r = subprocess.run(command, cwd=self.root, env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(r.returncode, code, r.stdout + r.stderr)
                self.assertNotIn('synthetic-link-target', r.stdout + r.stderr)
                self.assertNotIn(str(self.root), r.stdout + r.stderr)
                result = json.loads(r.stdout)
                if code == 2:
                    self.assertEqual(result['codes'], ['GIT_ENTRY_KIND_NOT_ALLOWED'])
                elif code == 1:
                    self.assertIn('POSSIBLE_SECRET_LITERAL', result['codes'])
                else:
                    self.assertEqual(result['metrics']['checked_files'], 1)

    def test_regular_to_symlink_git_mode_rejected_by_both_runners(self):
        base = self.repo()
        self.mode('120000')
        self.assertTrue(self.git('diff', '--name-status', base, 'HEAD').startswith('T\t'))
        self.runners(base, 2)

    def test_symlink_to_regular_is_scanned_by_both_runners(self):
        self.repo()
        base = self.mode('120000')
        self.mode('100644', 'synthetic regular file')
        self.assertTrue(self.git('diff', '--name-status', base, 'HEAD').startswith('T\t'))
        self.runners(base, 0)

    def test_symlink_to_regular_with_secret_blocks_both_runners(self):
        self.repo()
        base = self.mode('120000')
        value = 'sk-' + 'proj-' + 'a' * 30
        (self.root / 'tracked.txt').write_text(value)
        self.mode('100644', value)
        self.runners(base, 1)

    def test_gitlink_rejected_by_both_runners(self):
        base = self.repo()
        self.git('update-index', '--cacheinfo', '160000,' + base + ',tracked.txt')
        self.commit()
        self.runners(base, 2)
if __name__ == '__main__':
    unittest.main()
