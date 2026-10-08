"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type {
  OnboardingCriticalPaths,
  OnboardingNarrativeSections,
} from "@/lib/types";
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

/** Top files by criticality: tags as text, score, route and importer counts only when the index has them. */
export function CriticalPathsSection({
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
  section: OnboardingCriticalPaths;
  repoFullName: string;
  sha: string;
  expanded: boolean;
  onToggle: () => void;
  /** AI descriptions by path; absent or null keeps the facts-only rendering. */
  narrative?: OnboardingNarrativeSections["critical_paths"];
  narrativeSha?: string;
  outdated?: boolean;
  currentPaths?: ReadonlySet<string>;
}) {
  const t = useTranslations("onboarding");
  const descriptions = new Map(
    (narrative ?? []).map((n) => [n.path, n.description]),
  );
  const linkSha = outdated && narrativeSha ? narrativeSha : sha;
  return (
    <TourSection
      id="critical-paths"
      title={t("sections.critical_paths")}
      origin={narrative ? "ai" : "facts"}
      expanded={expanded}
      onToggle={onToggle}
      emptyMessage={
        section.items.length === 0 ? t("empty.critical_paths") : undefined
      }
    >
      {!section.graph_based && <p style={{ ...mutedStyle, margin: 0 }}>{t("critical.heuristic")}</p>}
      <ul style={s.list}>
        {section.items.map((item) => (
          <li key={item.path} style={{ ...s.inset, display: "flex", gap: 10, alignItems: "center" }}>
            <Icon.FileText size={16} aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 8px", minWidth: 0 }}>
                <span style={{ fontSize: 13, minWidth: 0, maxWidth: "100%", display: "inline-flex" }}>
                  <MiddleTruncatedPath path={item.path} />
                </span>
                {descriptions.has(item.path) && (
                  <>
                    <span aria-hidden="true" style={mutedStyle}>
                      —
                    </span>
                    <span style={{ ...mutedStyle, overflowWrap: "anywhere" }}>{descriptions.get(item.path)}</span>
                  </>
                )}
              </div>
              {notInIndex(item.path, outdated, currentPaths) && (
                <div style={mutedStyle}>{t("narrative.notInIndex")}</div>
              )}
              <div style={{ ...mutedStyle, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>{t("critical.score", { score: item.score })}</span>
                {item.route_count !== null && <span>{t("critical.routes", { count: item.route_count })}</span>}
                {item.importer_count !== null && (
                  <span>{t("critical.importers", { count: item.importer_count })}</span>
                )}
                {item.tags.map((tag) => (
                  <span key={tag}>{t(`critical.tags.${tag}`)}</span>
                ))}
              </div>
            </div>
            <OpenOnGitHub repoFullName={repoFullName} sha={linkSha} path={item.path} />
          </li>
        ))}
      </ul>
    </TourSection>
  );
}
