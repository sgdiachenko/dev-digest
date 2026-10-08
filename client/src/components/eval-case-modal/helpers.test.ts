import { describe, it, expect } from "vitest";
import type { EvalAttempt, EvalExpectation } from "@devdigest/shared";
import {
  assertionText,
  classifySaveError,
  contentFingerprint,
  deriveRunState,
  fingerprintOf,
  isDirtyVsSeed,
  parseExpected,
  saveDisabledReason,
  type DraftFields,
  type ParsedExpected,
  type RunState,
} from "./helpers";

const DIFF = [
  "diff --git a/src/config.ts b/src/config.ts",
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "@@ -10,6 +10,7 @@",
  " export const config = {",
  '+  stripeKey: "sk_live_x",',
  " };",
].join("\n");

const EXP: EvalExpectation = {
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
};

const FIELDS: DraftFields = {
  name: "case-a",
  diff: DIFF,
  prTitle: "Add stripe",
  prBody: "",
  expectedText: JSON.stringify([EXP]),
};

const OK: ParsedExpected = { ok: true, expectations: [EXP] };
const IDLE: RunState = { inFlight: false, attemptNotFound: false, attempt: null, outdated: false };
const DONE_ATTEMPT = (status: "pass" | "fail"): EvalAttempt => ({
  attempt_id: "a1",
  status: "done",
  started_at: "2026-10-08T10:00:00Z",
  result: {
    case_id: null,
    case_name: "case-a",
    status,
    error_reason: null,
    actual_findings: [],
    dropped_findings: [],
    expected_count: 1,
    actual_count: status === "pass" ? 1 : 0,
    duration_ms: 1800,
    cost_usd: null,
  },
});
const base = (over: Partial<Parameters<typeof saveDisabledReason>[0]> = {}) =>
  saveDisabledReason({
    diffUnavailable: false,
    parsed: OK,
    nameBlank: false,
    run: { ...IDLE, attempt: DONE_ATTEMPT("pass") },
    saving: false,
    ...over,
  });

describe("parseExpected", () => {
  it("accepts valid expectations and reports the error next to the field otherwise (AC-145, AC-146)", () => {
    expect(parseExpected(JSON.stringify([EXP]), "must_find", DIFF)).toEqual({ ok: true, expectations: [EXP] });

    const bad = parseExpected("{not json", "must_find", DIFF);
    expect(bad).toMatchObject({ ok: false, error: { key: "invalidJson" } });

    expect(parseExpected("[]", "must_find", DIFF)).toMatchObject({ ok: false, error: { key: "noExpectation" } });

    const reversed = parseExpected(JSON.stringify([{ ...EXP, start_line: 12, end_line: 11 }]), "must_find", DIFF);
    expect(reversed).toMatchObject({ ok: false, error: { key: "reversedRange" } });

    const otherFile = parseExpected(JSON.stringify([{ ...EXP, file: "src/other.ts" }]), "must_find", DIFF);
    expect(otherFile).toMatchObject({ ok: false, error: { key: "fileNotInDiff", values: { file: "src/other.ts" } } });

    const outside = parseExpected(JSON.stringify([{ ...EXP, start_line: 90, end_line: 91 }]), "must_find", DIFF);
    expect(outside).toMatchObject({ ok: false, error: { key: "linesOutsideHunks", values: { range: "90-91" } } });
  });
});

describe("fingerprint, dirty check and banner text", () => {
  it("fingerprint ignores the name but not the diff, meta or expectations", () => {
    const fp = fingerprintOf(FIELDS);
    expect(fingerprintOf({ ...FIELDS, name: "renamed" })).toBe(fp);
    expect(fingerprintOf({ ...FIELDS, diff: DIFF + "\n" })).not.toBe(fp);
    expect(fingerprintOf({ ...FIELDS, prTitle: "x" })).not.toBe(fp);
    expect(fingerprintOf({ ...FIELDS, expectedText: "[]" })).not.toBe(fp);
    expect(contentFingerprint(DIFF, { title: "Add stripe", body: "" }, FIELDS.expectedText)).toBe(fp);
  });

  it("isDirtyVsSeed flags a name or content change only", () => {
    expect(isDirtyVsSeed(FIELDS, { ...FIELDS })).toBe(false);
    expect(isDirtyVsSeed(FIELDS, { ...FIELDS, name: "other" })).toBe(true);
    expect(isDirtyVsSeed(FIELDS, { ...FIELDS, prBody: "b" })).toBe(true);
  });

  it("assertionText picks the positive or negative sentence", () => {
    expect(assertionText("must_find", EXP)).toEqual({
      key: "assertMustFind",
      values: { title: "Hardcoded key", file: "src/config.ts", range: "11" },
    });
    expect(assertionText("must_not_flag", { ...EXP, end_line: 14 })).toMatchObject({
      key: "assertMustNotFlag",
      values: { range: "11-14" },
    });
  });
});

describe("deriveRunState", () => {
  it("derives in-flight, outdated and attempt_not_found without stored state (AC-44, AC-148, AC-160)", () => {
    const run = { attemptId: "a1", fingerprint: "fp1" };
    expect(deriveRunState(null, { data: undefined, error: null }, "fp1")).toEqual(IDLE);
    expect(deriveRunState(run, { data: undefined, error: null }, "fp1").inFlight).toBe(true);
    const running: EvalAttempt = { ...DONE_ATTEMPT("pass"), status: "running", result: null };
    expect(deriveRunState(run, { data: running, error: null }, "fp1").inFlight).toBe(true);

    const finished = deriveRunState(run, { data: DONE_ATTEMPT("pass"), error: null }, "fp1");
    expect(finished).toMatchObject({ inFlight: false, outdated: false });
    expect(finished.attempt?.attempt_id).toBe("a1");
    expect(deriveRunState(run, { data: DONE_ATTEMPT("pass"), error: null }, "fp2").outdated).toBe(true);

    const gone = deriveRunState(run, { data: undefined, error: { status: 404 } }, "fp1");
    expect(gone).toMatchObject({ attemptNotFound: true, inFlight: false, attempt: null });
  });
});

describe("saveDisabledReason", () => {
  it("is null after a finished run and ignores a fail result or a duplicate (AC-45, AC-154)", () => {
    expect(base()).toBeNull();
    expect(base({ run: { ...IDLE, attempt: DONE_ATTEMPT("fail") } })).toBeNull();
  });

  it("blocks with the first matching reason", () => {
    expect(base({ run: IDLE })).toBe("run_first"); // AC-43
    expect(base({ run: { ...IDLE, attempt: DONE_ATTEMPT("pass"), outdated: true } })).toBe("run_first"); // AC-44
    expect(base({ run: { ...IDLE, inFlight: true } })).toBe("in_flight"); // AC-148
    expect(base({ run: { ...IDLE, attemptNotFound: true } })).toBe("attempt_not_found"); // AC-160
    expect(base({ parsed: { ok: false, error: { key: "invalidJson", values: {}, message: "" } } })).toBe("invalid"); // AC-146
    expect(base({ nameBlank: true })).toBe("invalid");
    expect(base({ diffUnavailable: true, run: IDLE })).toBe("diff_unavailable"); // AC-144
    expect(base({ saving: true })).toBe("saving"); // AC-53
  });
});

describe("classifySaveError", () => {
  it("maps 409 name_taken to the name field (AC-157)", () => {
    expect(classifySaveError({ status: 409, code: "name_taken", message: "taken" })).toEqual({ kind: "name_taken" });
  });

  it("reads the path of the first zod issue in a 422 array (AC-52)", () => {
    const err = {
      status: 422,
      code: "validation_error",
      message: "Request validation failed",
      details: [{ path: ["expectations", 0, "end_line"], message: "end_line before start_line" }],
    };
    expect(classifySaveError(err)).toEqual({
      kind: "validation",
      text: "expectations.0.end_line: end_line before start_line",
    });
  });

  it("reads field and message from a single-object 422 detail", () => {
    const err = { status: 422, code: "validation_error", message: "bad", details: { field: "name" } };
    expect(classifySaveError(err)).toEqual({ kind: "validation", text: "name: bad" });
  });

  it("falls back to the generic message for other errors", () => {
    expect(classifySaveError({ status: 500, message: "boom" })).toEqual({ kind: "generic" });
  });
});
