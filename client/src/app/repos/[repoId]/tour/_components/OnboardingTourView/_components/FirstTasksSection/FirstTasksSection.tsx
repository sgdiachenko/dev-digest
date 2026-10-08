"use client";

import { useTranslations } from "next-intl";
import type {
  OnboardingFirstTasks,
  OnboardingNarrativeSections,
} from "@/lib/types";
import { taskTitleKey } from "../../helpers";
import { s } from "../../styles";
import { MiddleTruncatedPath } from "../MiddleTruncatedPath";
import { OpenOnGitHub } from "../OpenOnGitHub";
import { TourSection } from "../TourSection";

const mutedStyle = s.muted;

/** Outdated narrative only: a path the current index no longer has (directories match by prefix). */
function notInIndex(
  path: string,
  outdated: boolean | undefined,
  current: ReadonlySet<string> | undefined,
): boolean {
  if (!outdated || !current || current.has(path)) return false;
  const dir = path.endsWith("/") ? path : `${path}/`;
  for (const p of current) if (p.startsWith(dir)) return false;
  return true;
}

/** Starter tasks: templated title, the file or directory it points at, complexity (and line when known). */
export function FirstTasksSection({
  section,
  repoFullName,
  sha,
  expanded,
  onToggle,
  narrative,
  narrativeSha,
  outdated,
  currentPaths,
}: {
  section: OnboardingFirstTasks;
  repoFullName: string;
  sha: string;
  expanded: boolean;
  onToggle: () => void;
  /** AI title, description and complexity by task id; paths, kinds and lines always come from facts. */
  narrative?: OnboardingNarrativeSections["first_tasks"];
  narrativeSha?: string;
  outdated?: boolean;
  currentPaths?: ReadonlySet<string>;
}) {
  const t = useTranslations("onboarding");
  const byId = new Map((narrative ?? []).map((n) => [n.task_id, n]));
  const linkSha = outdated && narrativeSha ? narrativeSha : sha;
  return (
    <TourSection
      id="first-tasks"
      title={t("sections.first_tasks")}
      origin={narrative ? "ai" : "facts"}
      expanded={expanded}
      onToggle={onToggle}
      emptyMessage={
        section.items.length === 0 ? t("empty.first_tasks") : undefined
      }
    >
      <ul
        style={{
          ...s.list,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {section.items.map((item) => {
          const ai = byId.get(item.id);
          const complexity = ai?.complexity ?? item.complexity;
          const tone = complexity === "low" ? "var(--ok)" : "var(--warn)";
          return (
            <li key={item.id} style={{ ...s.inset, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, overflowWrap: "anywhere" }}>
                  {ai ? ai.title : t(taskTitleKey(item.signal), { path: item.path })}
                </div>
                <OpenOnGitHub
                  repoFullName={repoFullName}
                  sha={linkSha}
                  path={item.path}
                  kind={item.path_kind}
                />
              </div>
              {ai && <div style={{ ...mutedStyle, overflowWrap: "anywhere" }}>{ai.description}</div>}
              {notInIndex(item.path, outdated, currentPaths) && (
                <div style={mutedStyle}>{t("narrative.notInIndex")}</div>
              )}
              <span style={{ ...mutedStyle, minWidth: 0, maxWidth: "100%", display: "inline-flex" }}>
                <MiddleTruncatedPath path={item.path} />
              </span>
              <div style={{ ...mutedStyle, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: "auto" }}>
                <span
                  style={{
                    border: `1px solid ${tone}`,
                    color: tone,
                    borderRadius: 999,
                    padding: "1px 10px",
                  }}
                >
                  {t(`firstTasks.complexity.${complexity}`)}
                </span>
                {item.path_kind === "directory" && <span>{t("firstTasks.directory")}</span>}
                {item.line !== null && <span>{t("firstTasks.line", { line: item.line })}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </TourSection>
  );
}
