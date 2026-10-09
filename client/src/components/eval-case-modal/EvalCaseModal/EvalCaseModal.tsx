/* EvalCaseModal — "Turn into eval case" editor. Loads the server-built draft of a finding (or takes a
   saved case / an empty manual case), then hands a stable seed to EvalCaseForm. The agent is read-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import { useEvalDraft } from "@/lib/hooks/eval";
import { seedFromCase, seedFromDraft, seedManual, type FormSeed } from "../helpers";
import { EvalCaseForm } from "./_components/EvalCaseForm";

export type EvalCaseSource =
  | { kind: "finding"; findingId: string }
  | { kind: "case"; evalCase: EvalCase; agentName?: string | null }
  | { kind: "manual"; agentId: string; agentName?: string | null };

/** Stand-in seed while the draft loads or failed: the form is read-only then and never saves. */
const PLACEHOLDER_SEED: FormSeed = seedManual("", null);

export function EvalCaseModal({ source, onClose }: { source: EvalCaseSource; onClose: () => void }) {
  const tErr = useTranslations("eval.errors");
  const draft = useEvalDraft(source.kind === "finding" ? source.findingId : null, source.kind === "finding");

  if (source.kind === "case") {
    return <EvalCaseForm seed={seedFromCase(source.evalCase, source.agentName ?? null)} status="ready" onClose={onClose} />;
  }
  if (source.kind === "manual") {
    return <EvalCaseForm seed={seedManual(source.agentId, source.agentName ?? null)} status="ready" onClose={onClose} />;
  }
  if (draft.data) {
    return <EvalCaseForm key="ready" seed={seedFromDraft(draft.data)} status="ready" onClose={onClose} />;
  }
  if (draft.error) {
    const message = draft.error instanceof Error && draft.error.message ? draft.error.message : tErr("loadFailed");
    return <EvalCaseForm key="error" seed={PLACEHOLDER_SEED} status="error" loadError={message} onClose={onClose} />;
  }
  return <EvalCaseForm key="loading" seed={PLACEHOLDER_SEED} status="loading" onClose={onClose} />;
}
