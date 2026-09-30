"use client";

import { useTranslations } from "next-intl";
import type { ContextCategory } from "@/lib/types";
import { s } from "../../styles";
import { CATEGORIES } from "../../constants";

/** Path filter input plus one aria-pressed toggle per category. State lives in the URL (owned by the parent). */
export function CatalogFilters({
  q,
  cats,
  onQuery,
  onToggleCategory,
}: {
  q: string;
  cats: ContextCategory[];
  onQuery: (q: string) => void;
  onToggleCategory: (cat: ContextCategory) => void;
}) {
  const t = useTranslations("context");
  return (
    <div style={s.filters}>
      <label>
        <span style={s.srOnly}>{t("filter.label")}</span>
        <input
          type="search"
          value={q}
          placeholder={t("filter.placeholder")}
          style={s.filterInput}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <div role="group" aria-label={t("filter.categoriesLabel")} style={s.chipRow}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={cats.includes(cat)}
            style={s.chip(cats.includes(cat))}
            onClick={() => onToggleCategory(cat)}
          >
            {t(`categories.${cat}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
