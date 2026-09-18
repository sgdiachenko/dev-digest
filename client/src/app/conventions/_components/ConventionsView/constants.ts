export const STATUS_FILTERS = ["all", "pending", "accepted", "rejected"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const DEFAULT_FILTER: StatusFilter = "all";
