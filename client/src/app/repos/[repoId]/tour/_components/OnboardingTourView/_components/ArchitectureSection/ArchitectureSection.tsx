"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  OnboardingNarrativeSections,
  OnboardingSections,
} from "@/lib/types";
import { MermaidDiagram } from "@/components/mermaid-diagram/MermaidDiagram";
import { summaryArgs } from "../../helpers";
import { s } from "../../styles";
import { MiddleTruncatedPath } from "../MiddleTruncatedPath";
import { NarrativeMarkdown } from "../NarrativeMarkdown";
import { TourSection } from "../TourSection";
import { toMermaid } from "./mermaid";

const chipsStyle = {
  ...s.list,
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
} as const;
const chipStyle = {
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  minWidth: 0,
  maxWidth: "100%",
  padding: "4px 10px",
  fontSize: 12,
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
} as const;
const mutedStyle = { ...s.muted, whiteSpace: "nowrap" } as const;
/** Inset box that frames a diagram: scaled to the width, capped in height. */
const diagramBox = {
  ...s.inset,
  borderRadius: 10,
  padding: 16,
  display: "flex",
  justifyContent: "center",
  maxHeight: 340,
  overflow: "auto",
} as const;

/** Architecture overview from facts: summary, stack, modules (text alternative) and the module diagram. */
export function ArchitectureSection({
  sections,
  expanded,
  onToggle,
  narrative,
  narrativeSha,
  repoFullName,
}: {
  sections: OnboardingSections;
  expanded: boolean;
  onToggle: () => void;
  /** AI body and diagram; absent or null keeps the facts-only rendering. */
  narrative?: OnboardingNarrativeSections["architecture"];
  narrativeSha?: string;
  repoFullName?: string;
}) {
  const t = useTranslations("onboarding");
  const { stack, modules, diagram } = sections.architecture;
  const [diagramFailed, setDiagramFailed] = useState(false);
  const onInvalid = useCallback(() => setDiagramFailed(true), []);
  const [aiDiagramFailed, setAiDiagramFailed] = useState(false);
  const onAiInvalid = useCallback(() => setAiDiagramFailed(true), []);
  const aiChart = narrative?.diagram_mermaid ?? null;
  const useAi =
    narrative != null && repoFullName != null && narrativeSha != null;
  const chart = useMemo(() => (diagram ? toMermaid(diagram) : null), [diagram]);
  const empty = stack.length === 0 && modules.length === 0;

  return (
    <TourSection
      id="architecture"
      title={t("sections.architecture")}
      origin={useAi ? "ai" : "facts"}
      expanded={expanded}
      onToggle={onToggle}
      emptyMessage={empty ? t("empty.architecture") : undefined}
    >
      {useAi ? (
        <NarrativeMarkdown repoFullName={repoFullName} sha={narrativeSha}>
          {narrative.body_markdown}
        </NarrativeMarkdown>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {t(
            "architecture.summary",
            summaryArgs(sections, t("architecture.none")),
          )}
        </p>
      )}

      {useAi && aiChart && !aiDiagramFailed && (
        <div
          role="img"
          aria-label={t("architecture.diagram")}
          style={diagramBox}
        >
          <MermaidDiagram chart={aiChart} onInvalid={onAiInvalid} bare />
        </div>
      )}
      {useAi && aiChart && aiDiagramFailed && (
        <p style={{ ...mutedStyle, whiteSpace: "normal", margin: 0 }}>
          {t("narrative.aiDiagramUnavailable")}
        </p>
      )}
      {useAi && aiChart && !aiDiagramFailed ? null : diagram === null ||
        diagramFailed ? (
        <p style={{ ...mutedStyle, whiteSpace: "normal", margin: 0 }}>
          {t("architecture.noGraph")}
        </p>
      ) : (
        chart && (
          <div
            role="img"
            aria-label={t("architecture.diagram")}
            style={diagramBox}
          >
            <MermaidDiagram chart={chart} onInvalid={onInvalid} bare />
          </div>
        )
      )}
      {stack.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={s.subHeading}>{t("architecture.stack")}</h3>
          <ul style={chipsStyle}>
            {stack.map((e) => (
              <li key={`${e.kind}:${e.name}:${e.evidence_path}`} style={chipStyle}>
                <strong>{e.name}</strong>
                <MiddleTruncatedPath path={e.evidence_path} />
                <span style={mutedStyle}>
                  {t(e.confidence === "convention" ? "architecture.convention" : "architecture.verified")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modules.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={s.subHeading}>{t("architecture.modules")}</h3>
          <ul style={chipsStyle}>
            {modules.map((m) => (
              <li key={m.path} style={chipStyle}>
                <MiddleTruncatedPath path={m.path} />
                <span style={mutedStyle}>{t("architecture.moduleFiles", { count: m.file_count })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TourSection>
  );
}
