"""Smoke-test only the supported native CE helpers in disposable local fixtures."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HELPERS = (
    ROOT
    / ".compound-engineering/vendor/compound-engineering/skills/ce-code-review/scripts"
)


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        self.env = {
            **os.environ,
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_TERMINAL_PROMPT": "0",
        }
        # A caller may be reviewing through a private index: never inherit it.
        for name in (
            "GIT_INDEX_FILE",
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        ):
            self.env.pop(name, None)
        self.run_cmd("git", "init", "-q", "-b", "main")
        (self.repo / "example.py").write_text("value = 1\n")
        settings = self.repo / ".compound-engineering"
        settings.mkdir()
        (settings / "config.yaml").write_text(
            "docs_root: docs\ncross_model_review_mode: off\n"
        )
        self.run_cmd("git", "add", ".")
        self.run_cmd(
            "git",
            "-c",
            "user.name=CE fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=/dev/null",
            "commit",
            "-qm",
            "Fixture baseline",
        )

    def run_cmd(self, *args, input=None):
        return subprocess.run(
            args,
            cwd=self.repo,
            env=self.env,
            input=input,
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        ).stdout

    def helper(self, name, *args, input=None):
        return json.loads(
            self.run_cmd(sys.executable, str(HELPERS / name), *args, input=input)
        )

    def test_scope_and_config_only_pack_discovery(self):
        (self.repo / "example.py").write_text("value = 2\n")
        result = self.helper("review-scope.py", "--base", "HEAD", "--docs-root", "docs")
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["changed_files"], ["example.py"])
        self.assertFalse(result["declared_packs"])
        packs = self.helper("packs-resolve.py", "--declared-only")
        self.assertFalse(packs["declared"])
        self.assertEqual(packs["entries"], 0)

    def test_findings_mechanics_accepts_empty_review(self):
        result = self.helper(
            "findings-mechanics.py",
            input=json.dumps(
                [
                    {
                        "reviewer": "correctness",
                        "findings": [],
                        "residual_risks": [],
                        "testing_gaps": [],
                    }
                ]
            ),
        )
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["findings"], [])
        self.assertEqual(result["malformed_returns"], 0)

    def test_duplicate_findings_do_not_gain_cross_model_confidence(self):
        # These names are fixture data, not reviewer launches or external dispatch.
        finding = {
            "title": "Fixture duplicate finding",
            "severity": "P2",
            "file": "example.py",
            "line": 1,
            "confidence": 75,
            "autofix_class": "manual",
            "owner": "downstream-resolver",
            "requires_verification": False,
            "pre_existing": False,
            "first_evidence": "Synthetic fixture evidence",
        }
        for second in ("correctness", "reliability", "adversarial-unverified-fixture"):
            with self.subTest(second=second):
                returns = [
                    {
                        "reviewer": name,
                        "findings": [finding],
                        "residual_risks": [],
                        "testing_gaps": [],
                    }
                    for name in ("correctness", second)
                ]
                result = self.helper("findings-mechanics.py", input=json.dumps(returns))
                self.assertEqual(result["status"], "complete")
                self.assertEqual(result["malformed_returns"], 0)
                self.assertEqual(len(result["findings"]), 1)
                merged = result["findings"][0]
                self.assertEqual(merged["confidence"], 75)
                self.assertEqual(
                    len(merged["reviewers"]), len(set(("correctness", second)))
                )
                self.assertNotIn(
                    "adversarial-unverified-fixture", merged["independent_reviewers"]
                )

    def test_stage_log_records_and_summarises(self):
        run = self.repo / "run"
        self.helper("run-log.py", "event", "--run-dir", str(run), "--start", "scope")
        self.helper(
            "run-log.py",
            "event",
            "--run-dir",
            str(run),
            "--end",
            "scope",
            "--start",
            "receipt",
        )
        self.helper("run-log.py", "event", "--run-dir", str(run), "--end", "receipt")
        result = self.helper("run-log.py", "summarize", "--run-dir", str(run))
        self.assertEqual(result["status"], "complete")
        self.assertEqual(
            json.loads((run / "metadata.json").read_text())["cost"]["status"],
            "complete",
        )

    def test_helpers_do_not_create_vendor_bytecode(self):
        self.helper("review-scope.py", "--base", "HEAD", "--docs-root", "docs")
        self.helper("packs-resolve.py", "--declared-only")
        self.helper("findings-mechanics.py", input="[]")
        self.helper(
            "run-log.py",
            "event",
            "--run-dir",
            str(self.repo / "run"),
            "--start",
            "scope",
        )
        self.assertFalse(list(HELPERS.rglob("__pycache__")))


if __name__ == "__main__":
    unittest.main()
