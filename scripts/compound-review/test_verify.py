"""Offline integrity and fail-closed policy checks for the pinned review assets."""

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "verify_compound_review", Path(__file__).with_name("verify.py")
)
verify = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify)


class VerifyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(
            ROOT / ".compound-engineering", self.root / ".compound-engineering"
        )
        self.vendor = self.root / ".compound-engineering/vendor/compound-engineering"
        self.config = self.root / ".compound-engineering/config.yaml"

    def errors(self):
        return verify.verify_vendor(self.root)

    def test_pristine_vendor_passes(self):
        self.assertEqual(self.errors(), [])

    def test_modified_asset_fails(self):
        (self.vendor / "LICENSE").write_text("changed\n")
        self.assertTrue(any("hash mismatch" in error for error in self.errors()))

    def test_same_length_corruption_fails_digest_checks(self):
        asset = self.vendor / "LICENSE"
        original = asset.read_bytes()
        changed = bytes([original[0] ^ 1]) + original[1:]
        self.assertEqual(len(changed), len(original))
        asset.write_bytes(changed)
        self.assertTrue(any("hash mismatch" in error for error in self.errors()))

    def test_missing_asset_fails(self):
        (self.vendor / "LICENSE").unlink()
        self.assertTrue(any("missing" in error for error in self.errors()))

    def test_unlisted_asset_fails(self):
        (self.vendor / "extra.py").write_text("pass\n")
        self.assertTrue(any("unlisted" in error for error in self.errors()))

    def test_symlink_fails_even_if_bytes_match(self):
        source = self.vendor / "LICENSE"
        target = self.root / "licence-copy"
        target.write_bytes(source.read_bytes())
        source.unlink()
        source.symlink_to(target)
        self.assertTrue(any("symlink" in error for error in self.errors()))

    def test_symlinked_vendor_parent_fails(self):
        source = self.vendor.parent
        target = self.root / "vendor-copy"
        source.rename(target)
        source.symlink_to(target, target_is_directory=True)
        self.assertTrue(any("symlink" in error for error in self.errors()))

    def test_enabled_external_review_fails(self):
        self.config.write_text("docs_root: docs\ncross_model_review_mode: all\n")
        self.assertTrue(any("native-only" in error for error in self.errors()))

    def test_local_override_fails(self):
        self.config.with_name("config.local.yaml").write_text(
            "cross_model_review_mode: all\n"
        )
        self.assertTrue(any("local override" in error for error in self.errors()))

    def test_manifest_path_escape_fails(self):
        manifest = self.root / ".compound-engineering/upstream.lock.json"
        data = json.loads(manifest.read_text())
        data["files"][0]["path"] = "../outside"
        manifest.write_text(json.dumps(data))
        self.assertTrue(any("unsafe path" in error for error in self.errors()))

    def test_removing_any_required_asset_and_lock_entry_fails(self):
        manifest = self.root / ".compound-engineering/upstream.lock.json"
        original = manifest.read_text()
        data = json.loads(original)
        for entry in data["files"]:
            name = entry["path"]
            with self.subTest(path=name):
                asset = self.vendor / name
                content = asset.read_bytes()
                try:
                    changed = {
                        **data,
                        "files": [
                            item for item in data["files"] if item["path"] != name
                        ],
                    }
                    manifest.write_text(json.dumps(changed))
                    asset.unlink()
                    self.assertTrue(
                        any("required asset" in error for error in self.errors())
                    )
                finally:
                    asset.write_bytes(content)
                    manifest.write_text(original)

    def test_duplicate_manifest_path_fails(self):
        manifest = self.root / ".compound-engineering/upstream.lock.json"
        data = json.loads(manifest.read_text())
        data["files"].append(data["files"][0])
        manifest.write_text(json.dumps(data))
        self.assertTrue(any("duplicate" in error for error in self.errors()))


if __name__ == "__main__":
    unittest.main()
