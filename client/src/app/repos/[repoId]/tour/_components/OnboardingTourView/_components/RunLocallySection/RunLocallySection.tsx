"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import type {
  OnboardingNarrativeSections,
  OnboardingRunLocally,
} from "@/lib/types";
import { s } from "../../styles";
import { CommandRow } from "../CommandRow";
import { TourSection } from "../TourSection";

const mutedStyle = s.muted;

type Narr = NonNullable<OnboardingNarrativeSections["run_locally"]>;

/** Commands the narrative lists come first by its `position`; the rest keep facts order. Unknown ids are ignored. */
function reorder<C extends { id: string }>(
  commands: C[],
  narrative: Narr,
): C[] {
  const pos = new Map(narrative.map((n) => [n.command_id, n.position]));
  const listed = commands
    .filter((c) => pos.has(c.id))
    .sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  return [...listed, ...commands.filter((c) => !pos.has(c.id))];
}

/** Run-locally commands per package group, numbered from 1 per group, with a phase label when the phase changes. */
export function RunLocallySection({
  section,
  expanded,
  onToggle,
  onCopied,
  narrative,
}: {
  section: OnboardingRunLocally;
  expanded: boolean;
  onToggle: () => void;
  /** Forwarded to each command so the page can announce the copy in its live region. */
  onCopied?: () => void;
  /** AI ordering and notes by command id; commands themselves always come from facts. */
  narrative?: OnboardingNarrativeSections["run_locally"];
}) {
  const t = useTranslations("onboarding");
  const groups = section.groups
    .filter((g) => g.commands.length > 0)
    .map((g) =>
      narrative ? { ...g, commands: reorder(g.commands, narrative) } : g,
    );
  const notes = new Map((narrative ?? []).map((n) => [n.command_id, n.note]));
  return (
    <TourSection
      id="run-locally"
      title={t("sections.run_locally")}
      origin={narrative ? "ai" : "facts"}
      expanded={expanded}
      onToggle={onToggle}
      emptyMessage={groups.length === 0 ? t("empty.run_locally") : undefined}
    >
      {groups.map((group) => (
        <div key={group.package_path} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, overflowWrap: "anywhere" }}>
            {group.package_path ? t("runLocally.group", { path: group.package_path }) : t("runLocally.rootGroup")}
          </h3>
          {group.ecosystem && <div style={mutedStyle}>{t("runLocally.ecosystem", { ecosystem: group.ecosystem })}</div>}
          <ol style={s.list}>
            {group.commands.map((command, i) => (
              <Fragment key={command.id}>
                {(i === 0 || group.commands[i - 1]?.phase !== command.phase) && (
                  <li role="presentation" style={{ ...s.subHeading, listStyle: "none", marginTop: i === 0 ? 0 : 8 }}>
                    {t(`runLocally.phase.${command.phase}`)}
                  </li>
                )}
                <CommandRow command={command} number={i + 1} onCopied={onCopied} />
                {notes.get(command.id) && (
                  <li role="presentation" style={{ ...mutedStyle, listStyle: "none", overflowWrap: "anywhere" }}>
                    {notes.get(command.id)}
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        </div>
      ))}
    </TourSection>
  );
}
