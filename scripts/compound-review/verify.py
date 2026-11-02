#!/usr/bin/env python3
"""Verify vendored CE bytes and native-only configuration without network access."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath

REPOSITORY = "https://github.com/EveryInc/compound-engineering-plugin"
NATIVE_CONFIG = "docs_root: docs\ncross_model_review_mode: off\n"
# Complete inventory at the reviewed pin, independent of the mutable lock entries.
REQUIRED = {
    "LICENSE",
    "plugin.json",
    "skills/ce-code-review/SKILL.md",
    "skills/ce-code-review/references/action-class-rubric.md",
    "skills/ce-code-review/references/cross-model-recovery.md",
    "skills/ce-code-review/references/cross-model-review.md",
    "skills/ce-code-review/references/depth-paths.md",
    "skills/ce-code-review/references/diff-scope.md",
    "skills/ce-code-review/references/dispatch-reviewers.md",
    "skills/ce-code-review/references/findings-schema.json",
    "skills/ce-code-review/references/finish-input.md",
    "skills/ce-code-review/references/finish-review.md",
    "skills/ce-code-review/references/intent-and-plan.md",
    "skills/ce-code-review/references/modes-and-output.md",
    "skills/ce-code-review/references/persona-catalog.md",
    "skills/ce-code-review/references/personas/adversarial-reviewer.md",
    "skills/ce-code-review/references/personas/agent-native-reviewer.md",
    "skills/ce-code-review/references/personas/api-contract-reviewer.md",
    "skills/ce-code-review/references/personas/correctness-reviewer.md",
    "skills/ce-code-review/references/personas/data-migration-reviewer.md",
    "skills/ce-code-review/references/personas/deployment-verification-agent.md",
    "skills/ce-code-review/references/personas/julik-frontend-races-reviewer.md",
    "skills/ce-code-review/references/personas/learnings-researcher.md",
    "skills/ce-code-review/references/personas/maintainability-reviewer.md",
    "skills/ce-code-review/references/personas/performance-reviewer.md",
    "skills/ce-code-review/references/personas/previous-comments-reviewer.md",
    "skills/ce-code-review/references/personas/project-standards-reviewer.md",
    "skills/ce-code-review/references/personas/reliability-reviewer.md",
    "skills/ce-code-review/references/personas/security-reviewer.md",
    "skills/ce-code-review/references/personas/swift-ios-reviewer.md",
    "skills/ce-code-review/references/personas/testing-reviewer.md",
    "skills/ce-code-review/references/review-output-template.md",
    "skills/ce-code-review/references/scope.md",
    "skills/ce-code-review/references/select-and-route.md",
    "skills/ce-code-review/references/subagent-template.md",
    "skills/ce-code-review/references/validator-batch-template.md",
    "skills/ce-code-review/scripts/cross-model-adversarial-review.sh",
    "skills/ce-code-review/scripts/findings-mechanics.py",
    "skills/ce-code-review/scripts/packs-resolve.py",
    "skills/ce-code-review/scripts/peer-job-runner.py",
    "skills/ce-code-review/scripts/review-scope.py",
    "skills/ce-code-review/scripts/run-log.py",
}


def has_symlink(path: Path, root: Path) -> bool:
    """Reject symlinks before reading a file or traversing its parents."""
    return any(
        part.is_symlink()
        for part in (path, *path.parents)
        if part != root and root in part.parents
    )


def verify_vendor(repo_root: Path) -> list[str]:
    root = repo_root.resolve()
    settings = root / ".compound-engineering"
    vendor = settings / "vendor/compound-engineering"
    lock = settings / "upstream.lock.json"
    config = settings / "config.yaml"
    errors: list[str] = []
    for path in (settings, vendor, lock, config):
        if has_symlink(path, root):
            errors.append(f"symlink not allowed: {path.relative_to(root)}")
    if errors:
        return errors
    try:
        if config.read_text() != NATIVE_CONFIG:
            errors.append(
                "config.yaml must retain the checked native-only configuration"
            )
        local = settings / "config.local.yaml"
        if local.exists() or local.is_symlink():
            errors.append(
                "local override unsupported: remove config.local.yaml before review"
            )
        manifest = json.loads(lock.read_text())
    except (OSError, ValueError) as exc:
        return [*errors, f"cannot read configuration or lock: {exc}"]
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        return [*errors, "unsupported lock schema"]
    if manifest.get("repository") != REPOSITORY:
        errors.append("unexpected upstream repository")
    if not re.fullmatch(r"[0-9a-f]{40}", str(manifest.get("commit", ""))):
        errors.append("upstream commit must be a full SHA-1")
    entries = manifest.get("files")
    if not isinstance(entries, list):
        return [*errors, "lock files must be an array"]
    expected: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            errors.append("invalid lock entry")
            continue
        name = entry["path"]
        relative = PurePosixPath(name)
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or relative.as_posix() != name
            or "\\" in name
        ):
            errors.append(f"unsafe path in lock: {name}")
            continue
        if name in expected:
            errors.append(f"duplicate lock path: {name}")
            continue
        expected.add(name)
        path = vendor / name
        if has_symlink(path, root):
            errors.append(f"symlink not allowed: {name}")
            continue
        if not path.is_file():
            errors.append(f"missing vendor file: {name}")
            continue
        content = path.read_bytes()
        git_blob = hashlib.sha1(
            b"blob " + str(len(content)).encode() + b"\0" + content
        ).hexdigest()
        if (
            hashlib.sha256(content).hexdigest() != entry.get("sha256")
            or git_blob != entry.get("git_blob_sha1")
            or len(content) != entry.get("size")
        ):
            errors.append(f"hash mismatch: {name}")
    for name in sorted(expected - REQUIRED):
        errors.append(f"asset outside pinned inventory: {name}")
    for name in sorted(REQUIRED - expected):
        errors.append(f"required asset missing from lock: {name}")
    for path in vendor.rglob("*"):
        if path.is_symlink():
            errors.append(f"symlink not allowed: {path.relative_to(vendor)}")
        elif path.is_file() and path.relative_to(vendor).as_posix() not in expected:
            errors.append(f"unlisted vendor file: {path.relative_to(vendor)}")
    plugin = vendor / "plugin.json"
    if plugin.is_file() and not has_symlink(plugin, root):
        try:
            if json.loads(plugin.read_text()).get("version") != manifest.get("version"):
                errors.append("plugin version does not match the lock")
        except (OSError, ValueError, AttributeError) as exc:
            errors.append(f"cannot read plugin version: {exc}")
    return errors


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    errors = verify_vendor(root)
    if errors:
        print("Compound review verification FAILED:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    manifest = json.loads(
        (root / ".compound-engineering/upstream.lock.json").read_text()
    )
    print(
        f"Verified {len(manifest['files'])} official CE {manifest['version']} files at {manifest['commit']}."
    )
    print("Native-only policy verified. This checks assets, not review completion.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
