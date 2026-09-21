/* DiffModal — v{old} → current, computed client-side from two already-fetched
   bodies (no server diff endpoint). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import { useSkillVersion } from "../../../../../../../../../../lib/hooks/skills";
import { lineDiff } from "../../helpers";
import { s } from "./styles";

export function DiffModal({
  skillId,
  fromVersion,
  toVersion,
  currentBody,
  onClose,
}: {
  skillId: string;
  fromVersion: number;
  toVersion: number;
  currentBody: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const { data: from, isLoading } = useSkillVersion(skillId, fromVersion);

  return (
    <Modal title={t("versions.diffModalTitle", { a: fromVersion, b: toVersion })} onClose={onClose} width={760}>
      {isLoading || !from ? (
        <div style={s.loading}>…</div>
      ) : (
        <div style={s.body}>
          {lineDiff(from.body, currentBody).map((line, i) => (
            <div key={i} style={s.line(line.kind)}>
              <span className="mono" style={s.marker}>
                {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
              </span>
              <span className="mono">{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
