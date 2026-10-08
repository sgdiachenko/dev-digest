"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRefreshRepo } from "@/lib/hooks";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { useGenerateNarrative, useRepoTour } from "@/lib/hooks/tour";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SECTION_IDS, type SectionId } from "./constants";
import { buildMarkdown, currentPathsOf, exportFileName, parseHash, type TourT } from "./helpers";
import { s } from "./styles";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPathsSection } from "./_components/CriticalPathsSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { NarrativeControls } from "./_components/NarrativeControls";
import { NarrativeEstimate } from "./_components/NarrativeEstimate";
import { NarrativeStatus } from "./_components/NarrativeStatus";
import { OnThisPage } from "./_components/OnThisPage";
import { ReadingPathSection } from "./_components/ReadingPathSection";
import { RunLocallySection } from "./_components/RunLocallySection";
import { StatusBanner } from "./_components/StatusBanner";
import { TourHeader } from "./_components/TourHeader";
import { TourUnavailable } from "./_components/TourUnavailable";

/** `critical-paths` → `critical_paths` (the contract / `sections.*` i18n key). */
const sectionKey = (id: SectionId) => id.replace(/-/g, "_");

const allExpanded = (): Record<SectionId, boolean> =>
  Object.fromEntries(SECTION_IDS.map((id) => [id, true])) as Record<SectionId, boolean>;

/** Onboarding Tour page: facts-built sections, "On this page" navigation, index-state handling, Markdown export. */
export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const refresh = useRefreshRepo();
  const resyncIndex = useResyncRepoIntel(repoId);
  const tour = useRepoTour(repoId);
  const data = tour.data;
  const generate = useGenerateNarrative(repoId);

  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>(allExpanded);
  const [activeId, setActiveId] = useState<SectionId | null>(null);
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  // callback ref in state (C16): the observer attaches when the node really mounts, not on the loading render
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const hashHandled = useRef(false);

  /** Polite live-region message; the counter re-announces an identical text. */
  const announce = useCallback((text: string) => setAnnouncement((a) => ({ text, n: a.n + 1 })), []);

  // generating → ready|failed is announced politely; no reload, no focus move
  const narrativeStatus = data?.narrative?.status;
  const prevNarrativeStatus = useRef(narrativeStatus);
  useEffect(() => {
    const prev = prevNarrativeStatus.current;
    prevNarrativeStatus.current = narrativeStatus;
    if (prev !== "generating") return;
    if (narrativeStatus === "ready") announce(t("narrative.updated"));
    else if (narrativeStatus === "failed") announce(t("narrative.failedAnnounce"));
  }, [narrativeStatus, announce, t]);

  const hasSections = !!data?.sections;
  const availability = data?.availability;

  // not_indexed (or not_cloned after a successful Resync): poll the index state, reload on a new indexed SHA
  const polling = availability === "not_indexed" || (availability === "not_cloned" && refresh.isSuccess);
  const indexState = useRepoIntelStatus(repoId, polling);
  const indexedSha = indexState.data?.lastIndexedSha;
  const baselineSha = useRef<string | undefined>(undefined);
  const { refetch } = tour;
  useEffect(() => {
    if (!polling) {
      baselineSha.current = undefined;
      return;
    }
    if (indexedSha === undefined) return;
    if (baselineSha.current === undefined) {
      baselineSha.current = indexedSha;
    } else if (baselineSha.current !== indexedSha) {
      baselineSha.current = indexedSha;
      void refetch();
    }
  }, [polling, indexedSha, refetch]);

  // deep link: a known hash scrolls to its section once the tour has loaded; an unknown one stays at the top
  useEffect(() => {
    if (!hasSections || hashHandled.current) return;
    hashHandled.current = true;
    const id = parseHash(window.location.hash);
    if (!id) return;
    setExpanded((e) => ({ ...e, [id]: true }));
    document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  }, [hasSections]);

  // scroll-spy: the first section intersecting the top band of the viewport is current
  useEffect(() => {
    if (!contentEl || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        setActiveId(SECTION_IDS.find((id) => visible.has(id)) ?? null);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const id of SECTION_IDS) {
      const el = contentEl.querySelector(`#${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [contentEl]);

  const toggle = (id: SectionId) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const expand = (id: string) => setExpanded((e) => ({ ...e, [id]: true }));
  // D1: Resync without a clone must hit /refresh (useRefreshRepo); reload the tour when it lands
  const resync = () => refresh.mutate(repoId, { onSuccess: () => void refetch() });

  const repoFullName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoFullName, mono: true }, { label: t("crumb") }];

  const exportMarkdown = () => {
    if (!data) return;
    const markdown = buildMarkdown(data, repoFullName, t as unknown as TourT);
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(repoFullName.split("/").pop() ?? repoFullName, data.source_sha);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const navItems = SECTION_IDS.map((id) => ({ id, label: t(`sections.${sectionKey(id)}`) }));
  const title = <h1 style={s.title}>{t("title", { repo: repoFullName })}</h1>;
  const sha = data?.source_sha ?? null;

  let body: React.ReactNode;
  if (tour.isPending) {
    body = (
      <>
        <div style={s.layout}>
          <div style={s.nav}>
            <OnThisPage items={navItems} activeId={null} onExpand={expand} />
          </div>
          <div style={s.main}>
            {title}
            <div style={s.content} aria-busy="true" aria-label={t("states.loading")}>
              {navItems.map((i) => (
                <section key={i.id} id={i.id} style={s.skeletonCard}>
                  <Skeleton height={20} />
                </section>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  } else if (!data) {
    body = (
      <>
        {title}
        <ErrorState title={t("states.loadError")} onRetry={() => void refetch()} />
      </>
    );
  } else if (data.availability === "not_cloned" || data.availability === "not_indexed") {
    body = (
      <>
        {title}
        <TourUnavailable
          reason={data.availability}
          onResync={resync}
          resyncing={refresh.isPending}
        />
      </>
    );
  } else if (!data.sections) {
    body = (
      <>
        {title}
        <p role="status">{t("states.unavailable")}</p>
      </>
    );
  } else {
    const sections = data.sections;
    const treeSha = sha ?? "";
    const narrative = data.narrative;
    const ns = narrative?.sections;
    const narrativeSha = narrative?.source_sha ?? undefined;
    const outdated = narrative?.outdated ?? false;
    const currentPaths = currentPathsOf(sections);
    const generating = narrative?.status === "generating" || generate.isPending;
    const hasNarrative = !!ns && Object.values(ns).some((v) => v != null);
    body = (
      <>
        <div style={s.layout}>
          <div style={s.nav}>
            <OnThisPage items={navItems} activeId={activeId} onExpand={expand} />
          </div>
          <div style={s.main}>
            <TourHeader
              repoName={repoFullName}
              sha={sha}
              index={data.index}
              onExport={exportMarkdown}
              actions={
                <NarrativeControls
                  hasNarrative={hasNarrative}
                  generating={generating}
                  error={generate.error}
                  onGenerate={() => generate.mutate()}
                />
              }
              estimate={<NarrativeEstimate estimatedCost={data.estimated_cost} />}
              meta={<NarrativeStatus narrative={narrative} onRetry={() => generate.mutate()} />}
            />
            <StatusBanner index={data.index} onResync={() => resyncIndex.mutate()} resyncing={resyncIndex.isPending} />
          <div style={s.content} ref={setContentEl}>
            {narrative?.status === "generating" && <p style={s.regenerating}>{t("narrative.regeneratingNote")}</p>}
            <ArchitectureSection
              sections={sections}
              narrative={ns?.architecture}
              narrativeSha={narrativeSha}
              repoFullName={repoFullName}
              expanded={expanded.architecture}
              onToggle={() => toggle("architecture")}
            />
            <CriticalPathsSection
              section={sections.critical_paths}
              narrative={ns?.critical_paths}
              narrativeSha={narrativeSha}
              outdated={outdated}
              currentPaths={currentPaths}
              repoFullName={repoFullName}
              sha={treeSha}
              expanded={expanded["critical-paths"]}
              onToggle={() => toggle("critical-paths")}
            />
            <RunLocallySection
              section={sections.run_locally}
              narrative={ns?.run_locally}
              expanded={expanded["run-locally"]}
              onToggle={() => toggle("run-locally")}
              onCopied={() => announce(t("runLocally.copied"))}
            />
            <ReadingPathSection
              section={sections.reading_path}
              narrative={ns?.reading_path}
              narrativeSha={narrativeSha}
              outdated={outdated}
              currentPaths={currentPaths}
              repoFullName={repoFullName}
              sha={treeSha}
              expanded={expanded["reading-path"]}
              onToggle={() => toggle("reading-path")}
            />
            <FirstTasksSection
              section={sections.first_tasks}
              narrative={ns?.first_tasks}
              narrativeSha={narrativeSha}
              outdated={outdated}
              currentPaths={currentPaths}
              repoFullName={repoFullName}
              sha={treeSha}
              expanded={expanded["first-tasks"]}
              onToggle={() => toggle("first-tasks")}
            />
          </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {tour.isError && data && (
          <div role="alert" style={s.banner}>
            <span>{t("states.loadError")}</span>
            <button type="button" onClick={() => void refetch()}>
              {t("states.retry")}
            </button>
          </div>
        )}
        {body}
        <div role="status" aria-live="polite" style={s.liveRegion}>
          <span key={announcement.n}>{announcement.text}</span>
        </div>
      </div>
    </AppShell>
  );
}
