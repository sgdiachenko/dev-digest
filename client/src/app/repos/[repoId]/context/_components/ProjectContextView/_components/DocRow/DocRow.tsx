"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ContextDoc } from "@/lib/types";
import { s } from "../../styles";
import { formatSize, truncateMiddle } from "../../helpers";
import { TokenEstimate } from "../TokenEstimate";
import { UsedBy } from "../UsedBy";

/** One catalog row: a full-path button (name = full path) plus the token estimate beside it. */
export function DocRow({
  doc,
  selected,
  onSelect,
}: {
  doc: ContextDoc;
  selected: boolean;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  return (
    <li style={s.row(selected)}>
      <button
        type="button"
        style={s.rowButton}
        aria-label={doc.path}
        title={doc.path}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(doc.path)}
      >
        <span className="mono" style={s.rowPath}>
          {truncateMiddle(doc.path)}
        </span>
        <span style={s.rowMeta}>{t(`categories.${doc.category}`)}</span>
        <span className="tnum" style={s.rowMeta}>
          {formatSize(doc.size)}
        </span>
        {doc.status !== "ok" && <span style={s.rowMeta}>{t(`docStatus.${doc.status}`)}</span>}
        {doc.secret_warning && <Badge icon="AlertTriangle">{t("secretWarning")}</Badge>}
      </button>
      <UsedBy usedBy={doc.used_by} />
      <TokenEstimate tokens={doc.est_tokens} />
    </li>
  );
}
