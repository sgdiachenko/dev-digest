/** A navigation target inside the diff (opened from the PR Brief or a shared
 *  URL). The viewer stays brief-agnostic: every string arrives as a prop. */
export interface DiffTarget {
  path: string;
  /** New-side line to reveal, or null to target the file only. */
  line: number | null;
  /** Changes with every new target; a new key expands the file's card. */
  key: string;
  /** Ready-made "Line N isn't part of this diff" text. */
  lineNotInDiffLabel: string;
  /** True while the target line should look highlighted. */
  highlighted: boolean;
  /** Called with the element to scroll/focus: the line, else the file header. */
  onApplied: (el: HTMLElement) => void;
}
