import type { AgentSkillUsage, SeverityBucketCount } from "@devdigest/shared";
import { ApiError } from "../../../../../../../lib/api";
import { wholePercent } from "../../../../../../../lib/agent-stats/accept";
import type { TrendUnit } from "../../../../../../../lib/agent-stats/period";

export interface SkillShare {
  skillId: string;
  /** null = the recorded skill no longer exists (EC-43). */
  name: string | null;
  runs: number;
  /** Whole percent of the runs that recorded a skill list. */
  percent: number;
}

/** The five most-used skills by share of the runs with skill data; ties keep server order (AC-148). */
export function topSkills(skills: AgentSkillUsage[], runsWithData: number, limit = 5): SkillShare[] {
  if (runsWithData <= 0) return [];
  return skills
    .map((sk, i) => ({ sk, i }))
    .sort((a, b) => b.sk.runs - a.sk.runs || a.i - b.i)
    .slice(0, limit)
    .map(({ sk }) => ({
      skillId: sk.skill_id,
      name: sk.skill_name,
      runs: sk.runs,
      percent: wholePercent(sk.runs / runsWithData) ?? 0,
    }));
}

export function bucketTotal(b: SeverityBucketCount): number {
  return b.CRITICAL + b.WARNING + b.SUGGESTION;
}

export function maxBucketTotal(buckets: SeverityBucketCount[]): number {
  return buckets.reduce((max, b) => Math.max(max, bucketTotal(b)), 0);
}

/** Exclusive end of bucket `index`: the next bucket's start, the period's end for the last one. */
export function bucketEnd(buckets: SeverityBucketCount[], index: number, periodTo: string): string {
  return buckets[index + 1]?.bucket_start ?? periodTo;
}

/** "Oct 13" for a one-day bucket, "Oct 6 – Oct 12" for longer ones, date and time for an hourly one. */
export function bucketLabel(
  startIso: string,
  endIso: string,
  unit: TrendUnit,
  fmt: { date: (iso: string) => string; dateTime: (iso: string) => string },
): string {
  if (unit === "hour") return fmt.dateTime(startIso);
  const first = fmt.date(startIso);
  const last = fmt.date(new Date(Date.parse(endIso) - 1).toISOString());
  return first === last ? first : `${first} – ${last}`;
}

export function isApiStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}
