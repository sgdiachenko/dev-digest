import { localDateText, type Period } from "../../../lib/agent-stats/period";

/** The two date inputs' initial text: the current custom range, else empty. */
export function initialDates(period: Period): { start: string; end: string } {
  if (period.option !== "custom") return { start: "", end: "" };
  return {
    start: localDateText(new Date(period.from)),
    // `to` is local midnight of the day after the last day.
    end: localDateText(new Date(Date.parse(period.to) - 1)),
  };
}

/** The last instant shown to the user: a custom range's `to` is exclusive midnight, so step back. */
export function displayEnd(period: Period): string {
  return period.option === "custom" ? new Date(Date.parse(period.to) - 1).toISOString() : period.to;
}
