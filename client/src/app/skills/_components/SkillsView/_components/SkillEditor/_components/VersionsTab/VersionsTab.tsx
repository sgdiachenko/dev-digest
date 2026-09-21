/* VersionsTab — body-snapshot history. Diff compares a past snapshot against
   the CURRENT body; Restore appends a new version rather than rewinding
   history (the server never deletes/rewrites a skill_versions row). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkill, useRestoreSkillVersion, useSkillVersions } from "../../../../../../../../lib/hooks/skills";
import { DiffModal } from "./_components/DiffModal";
import { formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: skill } = useSkill(skillId);
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skillId);
  const restore = useRestoreSkillVersion();
  const [diffAgainst, setDiffAgainst] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if (isError || !versions || !skill) {
    return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  }

  const currentVersion = skill.version;

  return (
    <div style={s.wrap}>
      <div style={s.headRow}>
        <h2 style={s.heading}>{t("versions.heading")}</h2>
        <Badge color="var(--text-secondary)">{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.caption}>{t("versions.caption")}</p>

      {versions.map((v) => {
        const isCurrent = v.version === currentVersion;
        return (
          <div key={v.version} style={s.row}>
            <span className="mono" style={s.versionChip}>
              v{v.version}
            </span>
            <span style={s.note}>{v.note || t("versions.noNote")}</span>
            <span className="tnum" style={s.date}>
              {formatVersionDate(v.created_at)}
            </span>
            {isCurrent ? (
              <Badge color="var(--ok)" dot>
                {t("versions.current")}
              </Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="secondary" size="sm" icon="FileText" onClick={() => setDiffAgainst(v.version)}>
                  {t("versions.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="RefreshCw"
                  disabled={restore.isPending}
                  onClick={() => {
                    if (window.confirm(t("versions.restoreConfirm", { version: v.version }))) {
                      restore.mutate({ id: skillId, version: v.version });
                    }
                  }}
                >
                  {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffAgainst != null && (
        <DiffModal
          skillId={skillId}
          fromVersion={diffAgainst}
          toVersion={currentVersion}
          currentBody={skill.body}
          onClose={() => setDiffAgainst(null)}
        />
      )}
    </div>
  );
}
