/** Table columns in AC-80 order; widths feed the fixed table layout. */
export const COLUMNS: readonly { key: string; labelKey: string; width: number }[] = [
  { key: "when", labelKey: "runs.table.timestamp", width: 170 },
  { key: "pr", labelKey: "runs.table.pullRequest", width: 120 },
  { key: "agent", labelKey: "runs.table.agent", width: 170 },
  { key: "source", labelKey: "runs.table.source", width: 130 },
  { key: "duration", labelKey: "runs.table.duration", width: 70 },
  { key: "findings", labelKey: "runs.table.findings", width: 140 },
  { key: "cost", labelKey: "runs.table.cost", width: 70 },
  { key: "verdict", labelKey: "runs.table.verdict", width: 120 },
  { key: "status", labelKey: "runs.table.status", width: 120 },
  { key: "link", labelKey: "runs.table.link", width: 120 },
];
