/** Constants for the Smart Diff view (DiffTab). */
import type { SmartDiffRole } from "@devdigest/shared";

export interface RoleMeta {
  /** Key under the `prReview` namespace, e.g. "smartDiff.coreLabel". */
  labelKey: string;
  /** Key under the `prReview` namespace, e.g. "smartDiff.coreDescription". */
  descriptionKey: string;
  /** Group header's chip/square color. */
  color: string;
}

export const ROLE_META: Record<SmartDiffRole, RoleMeta> = {
  core: { labelKey: "smartDiff.coreLabel", descriptionKey: "smartDiff.coreDescription", color: "var(--accent)" },
  tests: { labelKey: "smartDiff.testsLabel", descriptionKey: "smartDiff.testsDescription", color: "var(--ok)" },
  wiring: { labelKey: "smartDiff.wiringLabel", descriptionKey: "smartDiff.wiringDescription", color: "var(--warn)" },
  docs: { labelKey: "smartDiff.docsLabel", descriptionKey: "smartDiff.docsDescription", color: "var(--info)" },
  boilerplate: {
    labelKey: "smartDiff.boilerplateLabel",
    descriptionKey: "smartDiff.boilerplateDescription",
    color: "var(--text-muted)",
  },
};

/** Groups collapsed by default — everything else starts expanded. */
export const COLLAPSED_BY_DEFAULT: Partial<Record<SmartDiffRole, boolean>> = {
  docs: true,
  boilerplate: true,
};
