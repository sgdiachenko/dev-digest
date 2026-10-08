export type DiffSegmentType = "same" | "add" | "del";
export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

/** Above this many token pairs the LCS table is skipped and the middle is shown as one removal + one addition. */
const MAX_LCS_CELLS = 4_000_000;

const tokenize = (text: string): string[] => text.match(/\s+|\S+/g) ?? [];

function push(out: DiffSegment[], type: DiffSegmentType, text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text;
  else out.push({ type, text });
}

/** Word-level diff (LCS over words and the whitespace between them): minimal removals/additions, in reading order. */
export function wordDiff(oldText: string, newText: string): DiffSegment[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const out: DiffSegment[] = [];
  push(out, "same", a.slice(0, start).join(""));

  if (midA.length * midB.length > MAX_LCS_CELLS) {
    push(out, "del", midA.join(""));
    push(out, "add", midB.join(""));
  } else {
    // lcs[i][j] = LCS length of midA[i..] and midB[j..]
    const lcs = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0));
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        push(out, "same", midA[i]!);
        i++;
        j++;
      } else if (j < midB.length && (i === midA.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
        push(out, "add", midB[j]!);
        j++;
      } else {
        push(out, "del", midA[i]!);
        i++;
      }
    }
  }

  push(out, "same", a.slice(endA).join(""));
  return out;
}

/** `[older, newer]` by `started_at`, whatever order they were selected in (AC-122). */
export function orderByStart<T extends { started_at: string }>(x: T, y: T): [T, T] {
  return x.started_at <= y.started_at ? [x, y] : [y, x];
}
