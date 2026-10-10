import type { CiTrigger } from "@devdigest/shared";

export const ALL_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];

export type PostAs = "github_review" | "pr_comment" | "none";

/** Post modes in display order; the first is the recommended default (AC-9). */
export const POST_AS_OPTIONS: readonly { value: PostAs; labelKey: string }[] = [
  { value: "github_review", labelKey: "exportWizard.postAs.githubReview" },
  { value: "pr_comment", labelKey: "exportWizard.postAs.prComment" },
  { value: "none", labelKey: "exportWizard.postAs.none" },
];

/** Wizard steps in the order of AC-2. */
export const STEP_KEYS = ["target", "configure", "preview", "install"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** Token permissions the PR install and Refresh need (AC-126). */
export const PERMISSION_KEYS = ["exportWizard.permissions.classic", "exportWizard.permissions.fineGrained"] as const;
