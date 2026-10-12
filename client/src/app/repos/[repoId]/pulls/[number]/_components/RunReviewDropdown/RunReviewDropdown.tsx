/* RunReviewDropdown — ported from components2.jsx, now a feature-local popover
   (the vendored Dropdown closes on every click and can't hold checkboxes).
   "Run all enabled agents" / a specific agent → POST /pulls/:id/review and hands
   the resulting runIds up so the parent can stream SSE live status; the
   AgentPicker section starts a multi-agent group. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { DROPDOWN_WIDTH } from "./constants";
import { s } from "./styles";
import { AgentPicker } from "./_components/AgentPicker";

export function RunReviewDropdown({
  prId,
  repoId,
  prNumber,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  repoId: string;
  prNumber: number;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents, isPending: agentsLoading } = useAgents();
  const run = useRunReview();
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  // Close on an outside click and on Escape (focus returns to the trigger).
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    setOpen(false);
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <div ref={rootRef} style={s.root}>
      <span
        ref={triggerRef}
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind={kind}
          size={size}
          iconRight="ChevronDown"
          icon="Sparkles"
          loading={run.isPending}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {run.isPending ? t("runReview.running") : t("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div style={{ ...s.panel, width: DROPDOWN_WIDTH }}>
          {warnMerged && (
            <>
              <div style={s.warning}>
                <Icon.AlertTriangle size={13} />
                {t("runReview.mergedWarning")}
              </div>
              <div style={s.divider} />
            </>
          )}
          <button
            type="button"
            style={{ ...s.item, ...(hasEnabled ? {} : s.muted) }}
            onClick={() => kick({ all: true })}
          >
            <Icon.Play size={13} />
            {t("runReview.runAll")}
          </button>
          <div style={s.divider} />
          {all.length || agentsLoading ? (
            <AgentPicker
              prId={prId}
              repoId={repoId}
              prNumber={prNumber}
              agents={all}
              loading={agentsLoading}
              onRunAgent={(agentId) => kick({ agentId })}
            />
          ) : (
            <button type="button" style={{ ...s.item, ...s.muted }} onClick={() => router.push("/agents")}>
              <Icon.Plus size={13} />
              No agents yet — create one
            </button>
          )}
          <div style={s.divider} />
          <button type="button" style={{ ...s.item, ...s.muted }} onClick={() => router.push("/agents")}>
            <Icon.Settings size={13} />
            {t("runReview.configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
