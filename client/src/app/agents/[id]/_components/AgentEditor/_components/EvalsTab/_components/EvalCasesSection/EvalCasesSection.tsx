/* EvalCasesSection — the agent's eval cases: header counts, Run all evals, New eval case, one row per
   case, and the modals behind Edit / New / Delete (AC-60..62, AC-64, AC-68, AC-71, AC-81, AC-83, AC-152). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalCase, EvalSuiteRun } from "@devdigest/shared";
import { EvalCaseModal } from "@/components/eval-case-modal";
import { useDeleteEvalCase, useStartEvalRun } from "@/lib/hooks/eval";
import { isActive } from "../../helpers";
import { inRunStatus, passingCounts } from "./helpers";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { DeleteCaseDialog } from "./_components/DeleteCaseDialog";
import { s } from "./styles";

type Modal = { kind: "edit"; evalCase: EvalCase } | { kind: "new" } | { kind: "delete"; evalCase: EvalCase } | null;

export function EvalCasesSection({
  agentId,
  agentName,
  cases,
  activeRun,
  onRunStarted,
}: {
  agentId: string;
  agentName: string;
  cases: EvalCase[];
  /** The suite run being tracked (in flight or just finished), if any. */
  activeRun: EvalSuiteRun | null | undefined;
  /** Called with the id of the run Run all evals started — or joined after a 409 (AC-83). */
  onRunStarted: (runId: string) => void;
}) {
  const t = useTranslations("eval");
  const [modal, setModal] = React.useState<Modal>(null);
  const startRun = useStartEvalRun(agentId);
  const deleteCase = useDeleteEvalCase(agentId);

  const { passed, withResult } = passingCounts(cases);
  const running = startRun.isPending || (activeRun != null && isActive(activeRun.status));
  const noCases = cases.length === 0;
  const disabledReason = noCases ? t("common.runAllEvalsDisabledNoCases") : running ? t("common.runAllEvalsDisabledActive") : null;

  const runAll = () =>
    startRun.mutate(undefined, { onSuccess: (res) => onRunStarted(res.run_id) });

  const confirmDelete = (evalCase: EvalCase) =>
    deleteCase.mutate(evalCase.id, { onSuccess: () => setModal(null) });

  const closeDelete = () => {
    deleteCase.reset();
    setModal(null);
  };

  return (
    <section aria-labelledby="eval-cases-title" style={s.wrap}>
      <div style={s.header}>
        <h2 id="eval-cases-title" style={s.title}>
          {t("casesSection.title")}
        </h2>
        {withResult > 0 && <span style={s.passing}>{t("casesSection.passing", { passed, total: withResult })}</span>}
        <span style={s.count}>{t("casesSection.count", { count: cases.length })}</span>
        <div style={s.headerActions}>
          {disabledReason && (
            <span id="eval-run-all-reason" style={s.reason}>
              {disabledReason}
            </span>
          )}
          <Button
            kind="secondary"
            icon="Play"
            disabled={disabledReason != null}
            aria-describedby={disabledReason ? "eval-run-all-reason" : undefined}
            onClick={runAll}
          >
            {t("common.runAllEvals")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={() => setModal({ kind: "new" })}>
            {t("casesSection.newCase")}
          </Button>
        </div>
      </div>
      {startRun.isError && (
        <div role="alert" style={s.error}>
          {t("errors.runStartFailed")}
        </div>
      )}

      {noCases ? (
        <div style={s.empty}>{t("casesSection.empty")}</div>
      ) : (
        <ul style={s.list}>
          {cases.map((c) => (
            <li key={c.id}>
              <EvalCaseRow
                evalCase={c}
                inRun={inRunStatus(c, activeRun)}
                onOpen={() => setModal({ kind: "edit", evalCase: c })}
                onDelete={() => setModal({ kind: "delete", evalCase: c })}
              />
            </li>
          ))}
        </ul>
      )}

      {modal?.kind === "edit" && (
        <EvalCaseModal source={{ kind: "case", evalCase: modal.evalCase, agentName }} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "new" && (
        <EvalCaseModal source={{ kind: "manual", agentId, agentName }} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "delete" && (
        <DeleteCaseDialog
          name={modal.evalCase.name}
          pending={deleteCase.isPending}
          failed={deleteCase.isError}
          onConfirm={() => confirmDelete(modal.evalCase)}
          onCancel={closeDelete}
        />
      )}
    </section>
  );
}
