/* EvalCaseForm — the modal itself once its seed is known (or while it loads / failed to load):
   fields, Run case (an unpersisted attempt), Save. Nothing is persisted before Save (DD-1, AC-5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import { EVAL_MAX_NAME_LENGTH } from "@devdigest/shared";
import { useModalFocus } from "@/components/modal-focus";
import { useCreateEvalCase, useEvalAttempt, useStartEvalAttempt, useUpdateEvalCase } from "@/lib/hooks/eval";
import { buildInput, classifySaveError, deriveRunState, saveDisabledReason, type FormSeed } from "../../../helpers";
import { useEvalCaseDraft } from "../../../useEvalCaseDraft";
import { useElapsedSeconds } from "../../useElapsedSeconds";
import { CaseBanner } from "../CaseBanner";
import { DiscardConfirm } from "../DiscardConfirm";
import { DuplicateWarning } from "../DuplicateWarning";
import { ExpectedOutputEditor } from "../ExpectedOutputEditor";
import { InputTabs } from "../InputTabs";
import { ResultPanel } from "../ResultPanel";
import { s } from "../../styles";

/** Name sent with an attempt of a case that has none yet — the attempt is never stored. */
const RUN_NAME_FALLBACK = "untitled";
const NAME_ERROR_ID = "eval-name-error";
const HINT_ID = "eval-save-hint";

export type FormStatus = "loading" | "error" | "ready";

export function EvalCaseForm({
  seed,
  status,
  loadError,
  onClose,
}: {
  seed: FormSeed;
  status: FormStatus;
  loadError?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval.modal");
  const tErr = useTranslations("eval.errors");
  const tCommon = useTranslations("eval.common");
  const draft = useEvalCaseDraft(seed);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);

  const startAttempt = useStartEvalAttempt(seed.agentId);
  const create = useCreateEvalCase(seed.agentId);
  const update = useUpdateEvalCase(seed.agentId);
  const attemptQuery = useEvalAttempt(draft.run?.attemptId);
  const run = deriveRunState(draft.run, attemptQuery, draft.fingerprint);
  const busy = startAttempt.isPending || run.inFlight;
  const seconds = useElapsedSeconds(busy ? startedAt : null);
  const unavailable = status !== "ready";

  const requestClose = () => {
    if (draft.dirty) setConfirming(true);
    else onClose();
  };
  useModalFocus(true, requestClose, bodyRef);

  const blocked = saveDisabledReason({
    diffUnavailable: unavailable,
    parsed: draft.parsed,
    nameBlank: draft.fields.name.trim() === "",
    run: { ...run, inFlight: busy },
    saving: draft.saving,
  });
  const hint =
    blocked === "run_first" ? t("saveDisabledRunFirst") : blocked === "attempt_not_found" ? tErr("attempt_not_found") : null;

  const onRun = () => {
    if (!draft.parsed.ok || unavailable || busy) return;
    setStartError(null);
    draft.clearRun();
    setStartedAt(Date.now());
    const fingerprint = draft.fingerprint;
    const name = draft.fields.name.trim() === "" ? RUN_NAME_FALLBACK : draft.fields.name;
    startAttempt.mutate(buildInput(seed, { ...draft.fields, name }, draft.parsed.expectations), {
      onSuccess: (res) => draft.startRun(res.attempt_id, fingerprint),
      onError: (e) => setStartError(e instanceof Error && e.message ? e.message : tErr("runStartFailed")),
    });
  };

  const onSave = async () => {
    if (blocked !== null || !draft.parsed.ok) return;
    if (!draft.beginSave()) return;
    setNameError(null);
    setSaveError(null);
    const input = buildInput(seed, draft.fields, draft.parsed.expectations);
    try {
      if (seed.caseId) await update.mutateAsync({ caseId: seed.caseId, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (e) {
      const failure = classifySaveError(e);
      if (failure.kind === "name_taken") setNameError(tErr("name_taken"));
      else setSaveError(failure.kind === "validation" ? failure.text : tErr("saveFailed"));
    } finally {
      draft.endSave();
    }
  };

  const name = draft.fields.name;
  const nameBlankShown = name.trim() === "" && draft.dirty;
  const nameMessage = nameError ?? (nameBlankShown ? t("nameRequired") : null);
  const banner = draft.parsed.ok ? (draft.parsed.expectations[0] ?? null) : seed.banner;

  return (
    <Modal
      width={920}
      title={
        <span title={name || undefined} style={s.title}>
          {name ? t("title", { name }) : t("newTitle")}
        </span>
      }
      subtitle={t("subtitle", { agent: seed.agentName ?? tCommon("dash") })}
      onClose={requestClose}
      footer={
        <div style={s.footer}>
          <span id={HINT_ID} style={s.footerHint}>
            {hint}
          </span>
          <Button kind="ghost" onClick={requestClose}>
            {t("cancel")}
          </Button>
          <Button kind="secondary" icon="Play" disabled={unavailable || busy || !draft.parsed.ok} onClick={onRun}>
            {t("runCase")}
          </Button>
          <Button
            kind="primary"
            icon="Check"
            disabled={blocked !== null}
            aria-describedby={hint ? HINT_ID : undefined}
            onClick={onSave}
          >
            {draft.saving ? t("saving") : t("save")}
          </Button>
        </div>
      }
    >
      <div ref={bodyRef}>
        {status === "loading" && <div style={s.loading}>{tCommon("loading")}</div>}
        {status === "error" && (
          <div role="alert" style={s.loading}>
            {loadError}
          </div>
        )}
        {status === "ready" && (
          <>
            {confirming && <DiscardConfirm onDiscard={onClose} onKeep={() => setConfirming(false)} />}
            <div style={s.grid}>
              <div style={s.left}>
                <CaseBanner type={seed.type} expectation={banner} />
                {seed.existingCase && <DuplicateWarning agentId={seed.agentId} name={seed.existingCase.name} />}
                <div style={s.pad}>
                  <FormField label={t("nameLabel")} required>
                    <TextInput
                      mono
                      value={name}
                      title={name}
                      maxLength={EVAL_MAX_NAME_LENGTH}
                      placeholder={t("namePlaceholder")}
                      aria-label={t("nameLabel")}
                      aria-invalid={nameMessage !== null}
                      aria-describedby={nameMessage ? NAME_ERROR_ID : undefined}
                      onChange={(v) => {
                        setNameError(null);
                        draft.set("name", v);
                      }}
                    />
                    {nameMessage && (
                      <div id={NAME_ERROR_ID} role="alert" style={s.fieldError}>
                        {nameMessage}
                      </div>
                    )}
                  </FormField>
                </div>
                <InputTabs fields={draft.fields} onChange={draft.set} diffSource={seed.diffSource} />
              </div>
              <div style={s.right}>
                <ExpectedOutputEditor
                  value={draft.fields.expectedText}
                  onChange={(v) => draft.set("expectedText", v)}
                  parsed={draft.parsed}
                />
                <ResultPanel
                  progressSeconds={busy ? seconds : null}
                  attempt={run.attempt}
                  outdated={run.outdated}
                  interrupted={run.attemptNotFound}
                  startError={startError}
                />
                {saveError && (
                  <div role="alert" style={s.fieldError}>
                    {saveError}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
