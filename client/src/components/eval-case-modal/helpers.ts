/* Pure helpers of the EvalCaseModal: fingerprint, assertion text, expected-output parsing
   (AC-145), dirty check, and the Save-gating rules (AC-43…AC-45, AC-148, AC-160). No React. */
import {
  EvalCaseInput,
  type EvalAttempt,
  type EvalCase,
  type EvalCaseDraft,
  type EvalCaseInputBody,
  type EvalCaseType,
  type EvalDiffSource,
  type EvalExpectation,
} from "@devdigest/shared";

/** The fields the user edits. `expectedText` is the raw JSON text of the expectations array. */
export interface DraftFields {
  name: string;
  diff: string;
  prTitle: string;
  prBody: string;
  expectedText: string;
}

/** What the form starts from: the editable fields plus the facts that are not editable. */
export interface FormSeed extends DraftFields {
  type: EvalCaseType;
  diffSource: EvalDiffSource;
  sourceFindingId: string | null;
  notes: string | null;
  prNumber: number | null;
  repoFullName: string | null;
  agentId: string;
  agentName: string | null;
  caseId: string | null;
  existingCase: { id: string; name: string } | null;
  /** First expectation, used by the Positive/Negative banner. */
  banner: EvalExpectation | null;
}

export type ExpectedErrorKey =
  | "invalidJson"
  | "noExpectation"
  | "reversedRange"
  | "fileNotInDiff"
  | "linesOutsideHunks";

export type ExpectedError = {
  key: ExpectedErrorKey | null;
  /** Placeholders for the message; `message` is the schema text when no key fits. */
  values: { file?: string; range?: string };
  message: string;
};

export type ParsedExpected =
  | { ok: true; expectations: EvalExpectation[] }
  | { ok: false; error: ExpectedError };

/** Changes whenever the diff, the PR meta or the expected output changes — not the name. */
export function contentFingerprint(diff: string, meta: { title: string; body: string }, expectedJson: string): string {
  return JSON.stringify([diff, meta.title, meta.body, expectedJson]);
}

export function rangeLabel(e: Pick<EvalExpectation, "start_line" | "end_line">): string {
  return e.start_line === e.end_line ? String(e.start_line) : `${e.start_line}-${e.end_line}`;
}

export type AssertionText = {
  key: "assertMustFind" | "assertMustNotFlag";
  values: { title: string; file: string; range: string };
};

/** Placeholders for the banner line ("MUST find '…' at file:range" / "MUST NOT comment on file:range"). */
export function assertionText(type: EvalCaseType, exp: EvalExpectation): AssertionText {
  return {
    key: type === "must_find" ? "assertMustFind" : "assertMustNotFlag",
    values: { title: exp.title ?? exp.category ?? "", file: exp.file, range: rangeLabel(exp) },
  };
}

export function expectedToText(expectations: EvalExpectation[]): string {
  return JSON.stringify(expectations, null, 2);
}

/** Validates the expected-output text against the same schema the server uses. */
export function parseExpected(text: string, type: EvalCaseType, diff: string): ParsedExpected {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: { key: "invalidJson", values: {}, message: "" } };
  }
  if (!Array.isArray(json)) return { ok: false, error: { key: "invalidJson", values: {}, message: "" } };

  const res = EvalCaseInput.safeParse({
    name: "x",
    type,
    input_diff: diff,
    input_meta: { pr_title: "x", pr_body: null, pr_number: null, repo_full_name: null },
    expectations: json,
    diff_source: "manual",
  });
  if (res.success) return { ok: true, expectations: res.data.expectations };

  const issue = res.error.issues.find((i) => i.path[0] === "expectations");
  if (!issue) return { ok: false, error: { key: null, values: {}, message: res.error.issues[0]?.message ?? "" } };
  const index = typeof issue.path[1] === "number" ? issue.path[1] : null;
  const exp = index === null ? undefined : (json[index] as Partial<EvalExpectation> | undefined);
  const values = {
    file: typeof exp?.file === "string" ? exp.file : "",
    range: exp && typeof exp.start_line === "number" ? rangeLabel({ start_line: exp.start_line, end_line: exp.end_line ?? exp.start_line }) : "",
  };
  if (issue.path.length === 1) return { ok: false, error: { key: "noExpectation", values, message: issue.message } };
  if (issue.code === "custom") {
    const key: ExpectedErrorKey | null =
      issue.path[2] === "end_line" ? "reversedRange" : issue.path[2] === "file" ? "fileNotInDiff" : issue.path[2] === "start_line" ? "linesOutsideHunks" : null;
    return { ok: false, error: { key, values, message: issue.message } };
  }
  return { ok: false, error: { key: null, values, message: issue.message } };
}

export function isDirtyVsSeed(seed: DraftFields, cur: DraftFields): boolean {
  return (
    seed.name !== cur.name ||
    contentFingerprint(seed.diff, { title: seed.prTitle, body: seed.prBody }, seed.expectedText) !==
      contentFingerprint(cur.diff, { title: cur.prTitle, body: cur.prBody }, cur.expectedText)
  );
}

export function fingerprintOf(f: DraftFields): string {
  return contentFingerprint(f.diff, { title: f.prTitle, body: f.prBody }, f.expectedText);
}

/** The run started from the current form: which attempt, and the content it ran against. */
export interface RunRef {
  attemptId: string;
  fingerprint: string;
}

export interface RunState {
  /** A Run case is in flight (AC-148). */
  inFlight: boolean;
  /** The server no longer knows the attempt (AC-159 / AC-160). */
  attemptNotFound: boolean;
  /** The finished attempt, if any. */
  attempt: EvalAttempt | null;
  /** Content changed after the shown result (AC-44). */
  outdated: boolean;
}

/** Derives the run state from the attempt query — nothing is stored, nothing is synced by effect. */
export function deriveRunState(
  run: RunRef | null,
  query: { data: EvalAttempt | undefined; error: unknown },
  currentFingerprint: string,
): RunState {
  if (!run) return { inFlight: false, attemptNotFound: false, attempt: null, outdated: false };
  const notFound = isNotFound(query.error);
  const data = query.data;
  const inFlight = !notFound && !query.error && (!data || data.status === "running");
  const attempt = !inFlight && data && data.status !== "running" ? data : null;
  return { inFlight, attemptNotFound: notFound, attempt, outdated: !!attempt && run.fingerprint !== currentFingerprint };
}

function isNotFound(err: unknown): boolean {
  return !!err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404;
}

export type SaveBlock =
  | "diff_unavailable"
  | "invalid"
  | "in_flight"
  | "saving"
  | "attempt_not_found"
  | "run_first"
  | null;

/** Why Save is disabled, first matching rule wins. A `fail` result does not block (AC-45); a duplicate never does (AC-154). */
export function saveDisabledReason(args: {
  diffUnavailable: boolean;
  parsed: ParsedExpected;
  nameBlank: boolean;
  run: RunState;
  saving: boolean;
}): SaveBlock {
  if (args.diffUnavailable) return "diff_unavailable";
  if (!args.parsed.ok) return "invalid";
  if (args.run.inFlight) return "in_flight";
  if (args.saving) return "saving";
  if (args.run.attemptNotFound) return "attempt_not_found";
  if (!args.run.attempt || args.run.outdated) return "run_first";
  return args.nameBlank ? "invalid" : null;
}

export function buildInput(seed: FormSeed, f: DraftFields, expectations: EvalExpectation[]): EvalCaseInputBody {
  return {
    name: f.name.trim(),
    type: seed.type,
    input_diff: f.diff,
    input_meta: {
      pr_title: f.prTitle,
      pr_body: f.prBody === "" ? null : f.prBody,
      pr_number: seed.prNumber,
      repo_full_name: seed.repoFullName,
    },
    expectations,
    source_finding_id: seed.sourceFindingId,
    diff_source: seed.diffSource,
    notes: seed.notes,
  };
}

export function seedFromDraft(d: EvalCaseDraft): FormSeed {
  return {
    name: d.name,
    diff: d.input_diff,
    prTitle: d.input_meta.pr_title,
    prBody: d.input_meta.pr_body ?? "",
    expectedText: expectedToText(d.expectations),
    type: d.type,
    diffSource: d.diff_source,
    sourceFindingId: d.source_finding_id,
    notes: d.notes,
    prNumber: d.input_meta.pr_number,
    repoFullName: d.input_meta.repo_full_name,
    agentId: d.owner_id,
    agentName: d.owner_name,
    caseId: null,
    existingCase: d.existing_case,
    banner: d.expectations[0] ?? null,
  };
}

export function seedFromCase(c: EvalCase, agentName: string | null): FormSeed {
  return {
    name: c.name,
    diff: c.input_diff,
    prTitle: c.input_meta.pr_title,
    prBody: c.input_meta.pr_body ?? "",
    expectedText: expectedToText(c.expectations),
    type: c.type,
    diffSource: c.diff_source,
    sourceFindingId: c.source_finding_id,
    notes: c.notes,
    prNumber: c.input_meta.pr_number,
    repoFullName: c.input_meta.repo_full_name,
    agentId: c.owner_id,
    agentName,
    caseId: c.id,
    existingCase: null,
    banner: c.expectations[0] ?? null,
  };
}

/** Manual mode (AC-71): an empty case with a pasted diff. */
export function seedManual(agentId: string, agentName: string | null): FormSeed {
  return {
    name: "",
    diff: "",
    prTitle: "",
    prBody: "",
    expectedText: "[]",
    type: "must_find",
    diffSource: "manual",
    sourceFindingId: null,
    notes: null,
    prNumber: null,
    repoFullName: null,
    agentId,
    agentName,
    caseId: null,
    existingCase: null,
    banner: null,
  };
}

export type SaveError = { kind: "name_taken" } | { kind: "validation"; text: string } | { kind: "generic" };

/** Maps a failed create/update into the field it belongs to (AC-157, AC-158); duck-typed so no import of the api layer. */
export function classifySaveError(err: unknown): SaveError {
  const e = err as { status?: number; code?: string; message?: string; details?: unknown } | null;
  if (e?.status === 409 && e.code === "name_taken") return { kind: "name_taken" };
  if (e?.status === 422) {
    // Zod validation failures arrive as an array of issues; AppError validation arrives as one object.
    const d = (Array.isArray(e.details) ? e.details[0] : e.details) as { field?: unknown; path?: unknown; message?: unknown } | undefined;
    const field = typeof d?.field === "string" ? d.field : Array.isArray(d?.path) ? d.path.join(".") : "";
    const message = typeof d?.message === "string" && d.message ? d.message : (e.message ?? "");
    return { kind: "validation", text: field ? `${field}: ${message}` : message };
  }
  return { kind: "generic" };
}
