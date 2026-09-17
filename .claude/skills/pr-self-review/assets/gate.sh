#!/usr/bin/env bash
#
# PR self-review gate — the enforcement half of the pr-self-review skill.
#
#   gate.sh hook            # PreToolUse(Bash) hook: reads the tool call on stdin
#   gate.sh check           # same verdict, human output; exit 1 when blocked
#   gate.sh fingerprint     # worktree fingerprint the report is keyed by
#   gate.sh report-path     # where this branch's report lives
#   gate.sh base            # merge-base of HEAD and the default branch
#
# A skill is an instruction; only this script can actually stop a PR. It denies
# `gh pr create` / `gh pr merge` / `gh pr ready` when the branch has no
# self-review report, when the report no longer describes the working tree, or
# when the report holds a CRITICAL finding. Everything else passes untouched.
#
# Deliberate escape hatch: prefix the command with PR_SELF_REVIEW_OVERRIDE=1.
# The override is allowed and stamped into the report, never silent.

set -uo pipefail

MAIN_BRANCH="${PR_SELF_REVIEW_MAIN:-main}"
REPORT_DIR_REL=".claude/pr-self-review"

# ---------------------------------------------------------------- primitives

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256
  else sha256sum
  fi
}

repo_root() { git rev-parse --show-toplevel 2>/dev/null; }

branch_slug() {
  local b
  b="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || return 1
  [ "$b" = "HEAD" ] && b="detached-$(git rev-parse --short HEAD)"
  printf '%s' "${b//\//__}"
}

base_sha() {
  git merge-base HEAD "origin/$MAIN_BRANCH" 2>/dev/null \
    || git merge-base HEAD "$MAIN_BRANCH" 2>/dev/null \
    || git rev-list --max-parents=0 HEAD 2>/dev/null | tail -1
}

# Identity of "all open changes": HEAD, the index/worktree diff, and the
# content of untracked files. Any edit anywhere in that set invalidates a
# report, which is the whole point — a stale pass must not unlock a PR.
# CONTENT only, and index-independent.
#
# Two traps this avoids, both found by the skill reviewing itself:
#  1. `git status --porcelain` encodes the INDEX, so `git add` shifts it while
#     every reviewed byte is identical.
#  2. Mixing `git diff HEAD` with a list of untracked files is also
#     index-dependent: `git add -N` moves a path from "untracked" to "tracked",
#     so the same content gets hashed under a different representation.
#
# So: hash HEAD, then one canonical `path <worktree-blob>` line per path that
# differs from HEAD — staged, unstaged or untracked, all spelled the same way.
# Staging becomes invisible; content does not.
fingerprint_inputs() {
  git rev-parse HEAD 2>/dev/null
  { git diff HEAD --name-only 2>/dev/null
    git diff --cached --name-only 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | LC_ALL=C sort -u | while IFS= read -r f; do
        [ -n "$f" ] || continue
        if [ -f "$f" ]; then
          printf '%s %s\n' "$f" "$(git hash-object -- "$f" 2>/dev/null || printf 'unreadable')"
        else
          printf '%s deleted\n' "$f"
        fi
      done
}

fingerprint() { fingerprint_inputs | sha256 | awk '{print $1}'; }

report_path() {
  local root slug
  root="$(repo_root)" || return 1
  slug="$(branch_slug)" || return 1
  printf '%s/%s/%s.json' "$root" "$REPORT_DIR_REL" "$slug"
}

# ------------------------------------------------------- command recognition

# True when one command segment actually invokes `gh pr create|merge|ready`.
# Leading env assignments and wrappers are skipped, so
# `PR_SELF_REVIEW_OVERRIDE=1 gh pr create` and `sudo gh pr merge` both match,
# while `git commit -m "gh pr create gate"` does not — the phrase is an
# argument there, not the command.
segment_is_pr_cmd() {
  local -a w
  read -ra w <<<"$1"
  local i=0
  while [ "$i" -lt "${#w[@]}" ]; do
    case "${w[$i]}" in
      env|sudo|command|time|nohup) i=$((i + 1)) ;;
      *=*)
        case "${w[$i]%%=*}" in
          '' | *[!A-Za-z0-9_]*) break ;;
        esac
        i=$((i + 1))
        ;;
      *) break ;;
    esac
  done
  local exe="${w[$i]:-}"
  [ "${exe##*/}" = "gh" ] || return 1
  [ "${w[$((i + 1))]:-}" = "pr" ] || return 1
  case "${w[$((i + 2))]:-}" in
    create | merge | ready) return 0 ;;
  esac
  return 1
}

is_pr_cmd() {
  local seg
  while IFS= read -r seg || [ -n "$seg" ]; do
    segment_is_pr_cmd "$seg" && return 0
  done < <(printf '%s\n' "$1" | tr ';|&\n' '\n\n\n\n')
  return 1
}

has_override() {
  [ "${PR_SELF_REVIEW_OVERRIDE:-}" = "1" ] && return 0
  case "$1" in *PR_SELF_REVIEW_OVERRIDE=1*) return 0 ;; esac
  return 1
}

# ------------------------------------------------------------------ verdicts

# Sets REASON; returns 0 to allow, 1 to block.
evaluate() {
  REASON=""
  local root report want got crit
  root="$(repo_root)" || return 0            # not a git repo — not our business
  report="$(report_path)" || return 0

  if [ ! -f "$report" ]; then
    REASON="No PR self-review report for this branch ($(basename "$report")).
Run /pr-self-review before opening or merging the PR."
    return 1
  fi

  want="$(jq -r '.fingerprint // ""' "$report" 2>/dev/null)"
  got="$(fingerprint)"
  if [ -z "$want" ] || [ "$want" != "$got" ]; then
    REASON="The PR self-review report is stale — the working tree changed since it was written.
Re-run /pr-self-review so the report covers the current changes."
    return 1
  fi

  crit="$(jq -r '[.findings[]? | select(.severity == "CRITICAL")] | length' "$report" 2>/dev/null)"
  [ -n "$crit" ] || crit=0
  if [ "$crit" -gt 0 ]; then
    REASON="PR self-review found $crit CRITICAL finding(s) — merging these changes is blocked:
$(jq -r '.findings[]? | select(.severity == "CRITICAL")
         | "  • \(.file):\(.line // 0) [\(.skill // "project")] \(.summary)"' "$report" 2>/dev/null)

Fix them and re-run /pr-self-review, or override deliberately:
  PR_SELF_REVIEW_OVERRIDE=1 <your command>
Full report: ${report%.json}.md"
    return 1
  fi
  return 0
}

stamp_override() {
  local report tmp
  report="$(report_path)" || return 0
  [ -f "$report" ] || return 0
  tmp="$report.tmp.$$"
  jq --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     '.overridden_at = $at
      | .overridden_findings = [.findings[]? | select(.severity == "CRITICAL") | .summary]' \
     "$report" >"$tmp" 2>/dev/null && mv "$tmp" "$report" || rm -f "$tmp"
}

# --------------------------------------------------------------------- modes

run_hook() {
  local payload cmd
  payload="$(cat)"

  # jq is how we read the tool call. Without it, stay conservative but never
  # block unrelated work: only a raw-text hit on a PR command is refused.
  if ! command -v jq >/dev/null 2>&1; then
    case "$payload" in
      *"gh pr create"* | *"gh pr merge"* | *"gh pr ready"*)
        printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"PR self-review gate needs jq to read its report. Install jq (brew install jq) or bypass with PR_SELF_REVIEW_OVERRIDE=1."}}'
        ;;
    esac
    exit 0
  fi

  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)"
  [ -n "$cmd" ] || exit 0
  is_pr_cmd "$cmd" || exit 0

  if has_override "$cmd"; then
    stamp_override
    jq -n '{systemMessage: "PR self-review gate overridden (PR_SELF_REVIEW_OVERRIDE=1) — the override is recorded in the branch report."}'
    exit 0
  fi

  if evaluate; then exit 0; fi
  jq -n --arg r "$REASON" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

run_check() {
  if evaluate; then
    echo "pr-self-review: PASS — no CRITICAL findings, report matches the working tree."
    exit 0
  fi
  echo "pr-self-review: BLOCKED" >&2
  printf '%s\n' "$REASON" >&2
  exit 1
}

case "${1:-hook}" in
  hook) run_hook ;;
  check) run_check ;;
  fingerprint) fingerprint ;;
  fingerprint-inputs) fingerprint_inputs ;;   # diff two dumps to explain a stale report
  report-path) report_path ;;
  base) base_sha ;;
  *)
    echo "usage: gate.sh {hook|check|fingerprint|fingerprint-inputs|report-path|base}" >&2
    exit 2
    ;;
esac
