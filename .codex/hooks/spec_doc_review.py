#!/usr/bin/env python3
"""Pause the first git commit attempt so project documentation can be reviewed."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


REVIEW_CONTEXT = """Before committing, review the staged, unstaged, and untracked changes against apps/shukka/docs/spec.md and every relevant document under apps/shukka/docs/adr/ and apps/shukka/docs/prd/. Check for semantic drift or contradictions in product behavior, requirements, architecture decisions, interfaces, invariants, workflows, and constraints. If the implementation changes any documented fact, update and stage the relevant documentation in the same change. Preserve the existing documentation format and do not invent missing ADR or PRD rules. If no documentation update is needed, briefly state why, then retry the commit."""

def contains_git_commit(command: str) -> bool:
    return re.search(r"git\s+commit", command, flags=re.IGNORECASE) is not None


def git_output(cwd: Path, *args: str) -> str | None:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def claim_review_gate(payload: dict[str, object]) -> bool | None:
    cwd_value = payload.get("cwd")
    cwd = Path(cwd_value) if isinstance(cwd_value, str) else Path.cwd()
    root_value = git_output(cwd, "rev-parse", "--show-toplevel")
    if root_value is None:
        return False

    root = Path(root_value)
    head = git_output(root, "rev-parse", "HEAD") or "unborn-head"
    session = payload.get("session_id")
    session_id = session if isinstance(session, str) else "unknown-session"
    marker_name = hashlib.sha256(f"{session_id}\0{head}".encode()).hexdigest()

    override = os.environ.get("SPEC_DOC_REVIEW_STATE_DIR")
    if override:
        state_dir = Path(override)
    else:
        git_path = git_output(root, "rev-parse", "--git-path", "codex-spec-review")
        if git_path is None:
            return None
        state_dir = Path(git_path)
        if not state_dir.is_absolute():
            state_dir = root / state_dir

    marker = state_dir / marker_name
    try:
        state_dir.mkdir(parents=True, exist_ok=True)
        marker.touch(exist_ok=False)
    except FileExistsError:
        return False
    except OSError:
        return None
    return True


def emit_context(*, deny: bool) -> None:
    hook_output: dict[str, object] = {
        "hookEventName": "PreToolUse",
        "additionalContext": REVIEW_CONTEXT,
    }
    output: dict[str, object] = {
        "systemMessage": "Review project documentation before committing.",
        "hookSpecificOutput": hook_output,
    }
    if deny:
        hook_output["permissionDecision"] = "deny"
        hook_output["permissionDecisionReason"] = REVIEW_CONTEXT
    json.dump(output, sys.stdout)
    sys.stdout.write("\n")


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return 0

    if not isinstance(payload, dict):
        return 0
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return 0
    command = tool_input.get("command")
    if not isinstance(command, str) or not contains_git_commit(command):
        return 0

    gate_claimed = claim_review_gate(payload)
    if gate_claimed is False:
        return 0
    emit_context(deny=gate_claimed is True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
