/* Skills screen — left rail of skill cards + a four-tab editor on the right.
   Same two-pane shape as the Agent Editor. Selection lives in the route
   (/skills vs /skills/:id), tab state in ?tab=. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { usePeriodUrl } from "../../../../lib/agent-stats/usePeriodUrl";
import { skillKeys, useSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { CreateSkillModal } from "./_components/CreateSkillModal/CreateSkillModal";
import { ImportUrlSkillModal } from "./_components/ImportUrlSkillModal/ImportUrlSkillModal";
import { SkillEditor } from "./_components/SkillEditor";
import { DEFAULT_TAB, VALID_TABS, type SkillTab } from "./constants";
import { filterSkills, skillHref } from "./helpers";
import { s } from "./styles";

export function SkillsView({ selectedId }: { selectedId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();

  const [query, setQuery] = React.useState("");
  const [addMode, setAddMode] = React.useState<"create" | "file" | "url" | null>(null);

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: skill, isLoading: skillLoading } = useSkill(selectedId);
  // Same `skills.enabled` gate the Config tab's toggle flips — one cache
  // entry, so a toggle on the rail and one in Config stay in sync.
  const update = useUpdateSkill();

  const requested = search.get("tab") ?? "";
  const tab = ((VALID_TABS as readonly string[]).includes(requested) ? requested : DEFAULT_TAB) as SkillTab;

  // The Stats period lives in the URL; it is lifted here so the rail link and Refresh can keep and re-read it.
  const qc = useQueryClient();
  const statsPeriod = usePeriodUrl({ enabled: tab === "stats" && !!selectedId });
  const { refresh } = statsPeriod;
  const onRefresh = React.useMemo(() => {
    if (tab !== "stats" || !selectedId) return undefined;
    const queryKey = skillKeys.stats(selectedId);
    return () =>
      refresh({
        isFetching: qc.isFetching({ queryKey }) > 0,
        refetchSame: () => void qc.refetchQueries({ queryKey }),
      });
  }, [tab, selectedId, refresh, qc]);

  const setTab = (next: string) => {
    if (!selectedId) return;
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${selectedId}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(skill ? [{ label: skill.name }] : []),
  ];

  const filtered = filterSkills(skills ?? [], query);

  return (
    <AppShell crumb={crumb} onRefresh={onRefresh}>
      {addMode === "file" && (
        <ImportSkillModal onClose={() => setAddMode(null)} onCreate={() => setAddMode("create")} onUrl={() => setAddMode("url")} />
      )}
      {addMode === "create" && (
        <CreateSkillModal onClose={() => setAddMode(null)} onImport={() => setAddMode("file")} onUrl={() => setAddMode("url")} />
      )}
      {addMode === "url" && <ImportUrlSkillModal onClose={() => setAddMode(null)} onCreate={() => setAddMode("create")} onFile={() => setAddMode("file")} />}
      <div style={s.split}>
        {/* rail */}
        <div style={s.rail}>
          <div style={s.railHead}>
            <div style={s.railTitleRow}>
              <h1 style={s.railTitle}>{t("page.heading")}</h1>
              <Button kind="primary" size="sm" icon="Plus" onClick={() => setAddMode("create")}>
                {t("page.addSkill")}
              </Button>
            </div>
            <div style={s.search}>
              <Icon.Search size={14} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>

          <div style={s.railList}>
            {isLoading && (
              <div style={s.railSkeleton}>
                <Skeleton height={96} />
                <Skeleton height={96} />
                <Skeleton height={96} />
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && filtered.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setAddMode("create")}
              />
            )}
            {filtered.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => router.push(skillHref(sk.id, search.toString()))}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {/* editor */}
        {!selectedId ? (
          <div style={s.placeholder}>
            <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
          </div>
        ) : skillLoading || !skill ? (
          <div style={s.editorSkeleton}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.editorPane}>
            <div style={s.editorHead}>
              <Icon.Sparkles size={18} style={s.editorIcon} />
              <h1 style={s.editorTitle}>{skill.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                v{skill.version}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
            </div>
            <div style={s.editorBody}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} statsPeriod={statsPeriod} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
