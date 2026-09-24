/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   Smart Diff finding annotations.
   Public surface: the DiffViewer component + the DiffCommentApi/DiffFindingApi
   contracts. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi } from "./findings";
export { topSeverity } from "./findings";
