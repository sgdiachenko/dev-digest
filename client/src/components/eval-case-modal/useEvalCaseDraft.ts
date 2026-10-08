/* useEvalCaseDraft — the editable draft of the EvalCaseModal: fields, the parsed expected output,
   the run the draft was last executed with, and the double-save guard (AC-53). The attempt itself
   (start + polling) lives in the component through lib/hooks/eval; `deriveRunState` turns it into
   `inFlight` / `outdated` / `attemptNotFound` so nothing here is synced by effect. */
"use client";

import React from "react";
import {
  fingerprintOf,
  isDirtyVsSeed,
  parseExpected,
  type DraftFields,
  type FormSeed,
  type ParsedExpected,
  type RunRef,
} from "./helpers";

export interface EvalCaseDraft {
  fields: DraftFields;
  set: <K extends keyof DraftFields>(key: K, value: DraftFields[K]) => void;
  parsed: ParsedExpected;
  fingerprint: string;
  dirty: boolean;
  run: RunRef | null;
  /** Remember the attempt that was started for the content of this moment. */
  startRun: (attemptId: string, fingerprint: string) => void;
  /** Forget the last run (a new one is about to start). */
  clearRun: () => void;
  /** False when a save is already pending — the caller must then send no request (AC-53). */
  beginSave: () => boolean;
  endSave: () => void;
  saving: boolean;
}

export function useEvalCaseDraft(seed: FormSeed): EvalCaseDraft {
  const [fields, setFields] = React.useState<DraftFields>({
    name: seed.name,
    diff: seed.diff,
    prTitle: seed.prTitle,
    prBody: seed.prBody,
    expectedText: seed.expectedText,
  });
  const [run, setRun] = React.useState<RunRef | null>(null);
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);

  const set = React.useCallback(<K extends keyof DraftFields>(key: K, value: DraftFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
  }, []);

  const beginSave = React.useCallback(() => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  }, []);
  const endSave = React.useCallback(() => {
    savingRef.current = false;
    setSaving(false);
  }, []);

  return {
    fields,
    set,
    parsed: parseExpected(fields.expectedText, seed.type, fields.diff),
    fingerprint: fingerprintOf(fields),
    dirty: isDirtyVsSeed(seed, fields),
    run,
    startRun: (attemptId, fingerprint) => setRun({ attemptId, fingerprint }),
    clearRun: () => setRun(null),
    beginSave,
    endSave,
    saving,
  };
}
