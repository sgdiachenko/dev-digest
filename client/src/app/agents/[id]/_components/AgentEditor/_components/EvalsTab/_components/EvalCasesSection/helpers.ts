import type { EvalCase, EvalCaseResult, EvalSuiteRun } from "@devdigest/shared";
import { isActive } from "../../helpers";

/** Status shown on a row while a suite run is in flight (AC-85). */
export type InRunStatus = "queued" | "running" | EvalCaseResult["status"];

/**
 * Where `evalCase` stands in the active run: its recorded result, else `running` for the first case
 * without one and `queued` for the rest. `null` when no run is active or the case is not part of it.
 */
export function inRunStatus(evalCase: EvalCase, run: EvalSuiteRun | null | undefined): InRunStatus | null {
  if (!run || !isActive(run.status) || !run.case_ids.includes(evalCase.id)) return null;
  const done = run.per_case.find((r) => r.case_id === evalCase.id);
  if (done) return done.status;
  if (run.status === "queued") return "queued";
  const firstPending = run.case_ids.find((id) => !run.per_case.some((r) => r.case_id === id));
  return firstPending === evalCase.id ? "running" : "queued";
}

/** `x / y passing`: cases that have a last result. */
export function passingCounts(cases: readonly EvalCase[]): { passed: number; withResult: number } {
  const withResult = cases.filter((c) => c.last_result != null);
  return { passed: withResult.filter((c) => c.last_result?.status === "pass").length, withResult: withResult.length };
}
