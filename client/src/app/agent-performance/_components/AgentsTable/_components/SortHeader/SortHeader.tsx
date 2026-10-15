"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { SortDir } from "../../helpers";
import { s } from "./styles";

/** A sortable column header: `<button>` inside `<th aria-sort>` (NFR-11); `extra` sits under the label. */
export function SortHeader({
  label,
  dir,
  disabled,
  onSort,
  extra,
}: {
  label: string;
  /** The active direction, or null when another column is sorted. */
  dir: SortDir | null;
  disabled: boolean;
  onSort: () => void;
  extra?: ReactNode;
}) {
  const t = useTranslations("agentPerformance");
  const sort = dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";
  return (
    <th scope="col" style={s.th} aria-sort={sort}>
      <button
        type="button"
        style={{ ...s.button, ...(disabled ? s.buttonDisabled : null) }}
        disabled={disabled}
        aria-label={t("dashboard.table.sortBy", { column: label })}
        onClick={onSort}
      >
        <span>{label}</span>
        {dir && <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
      {extra && <span style={s.extra}>{extra}</span>}
    </th>
  );
}
