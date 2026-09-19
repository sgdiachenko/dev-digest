import type { SkillType } from "@devdigest/shared";

/** Badge colour per skill type — matches SkillsView's TYPE_COLOR. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--info)",
  convention: "var(--accent)",
  security: "var(--warn)",
  custom: "var(--text-secondary)",
};
