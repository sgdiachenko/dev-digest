"use client";

import { useTranslations } from "next-intl";
import type {
  OnboardingReadingPath,
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

/** Guided reading order: position, path and why it is on the list (entry point, imported by item N, critical tag). */
export function ReadingPathSection({
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
  section: OnboardingReadingPath;
  repoFullName: string;
  sha: string;
  expanded: boolean;
  onToggle: () => void;
  /** AI descriptions by path; absent or null keeps the facts-only rendering. */
  narrative?: OnboardingNarrativeSections["reading_path"];
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
      id="reading-path"
      title={t("sections.reading_path")}
      origin={narrative ? "ai" : "facts"}
      expanded={expanded}
      onToggle={onToggle}
      emptyMessage={
        section.items.length === 0 ? t("empty.reading_path") : undefined
      }
    >
      {!section.graph_based && <p style={{ ...mutedStyle, margin: 0 }}>{t("readingPath.heuristic")}</p>}
      <ol style={s.list}>
        {section.items.map((item) => (
          <li key={item.path} style={{ ...s.inset, display: "flex", gap: 12, alignItems: "center" }}>
            <span
              aria-label={t("readingPath.position", { position: item.position })}
              style={{
                display: "inline-grid",
                placeItems: "center",
                flex: "0 0 24px",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "var(--accent-bg)",
                color: "var(--accent-text)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {item.position}
            </span>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, minWidth: 0, maxWidth: "100%", display: "inline-flex" }}>
                <MiddleTruncatedPath path={item.path} />
              </span>
              {descriptions.has(item.path) && (
                <div style={{ ...mutedStyle, overflowWrap: "anywhere" }}>{descriptions.get(item.path)}</div>
              )}
              {notInIndex(item.path, outdated, currentPaths) && (
                <div style={mutedStyle}>{t("narrative.notInIndex")}</div>
              )}
              <div style={{ ...mutedStyle, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>
                  {item.reason === "imported_by" && item.imported_by_position !== null
                    ? t("readingPath.reason.imported_by", { position: item.imported_by_position })
                    : t(`readingPath.reason.${item.reason}`, { position: item.imported_by_position ?? 0 })}
                </span>
                {item.tags.map((tag) => (
                  <span key={tag}>{t(`critical.tags.${tag}`)}</span>
                ))}
              </div>
            </div>
            <OpenOnGitHub repoFullName={repoFullName} sha={linkSha} path={item.path} />
          </li>
        ))}
      </ol>
    </TourSection>
  );
}
