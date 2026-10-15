"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parsePeriodParams, periodSearchParams, resolvePreset, type Period, type PeriodOption } from "./period";

export interface PeriodUrlState {
  /** The period to query; null while `enabled` is false. */
  period: Period | null;
  option: PeriodOption;
  /** The link carried a period that could not be used (AC-53). */
  notice: boolean;
  select: (next: Period) => void;
  /** No-op while a fetch is running; presets re-resolve to now, a custom range refetches as is. */
  refresh: (args: { isFetching: boolean; refetchSame: () => void }) => void;
  /** The period shown before a preset refresh, whose cached data bridges the reload. */
  refreshFrom: Period | null;
}

/**
 * The URL (`range`, `from`, `to`) is the source of truth for the period (C15). Missing or invalid
 * params fall back to 30 days, resolved once per mount (re-taken when `enabled` flips true, for a hook mounted on
 * another tab), and are written to the URL by one effect.
 */
export function usePeriodUrl({ enabled }: { enabled: boolean }): PeriodUrlState {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const spText = sp.toString();

  const [mountNow, setMountNow] = React.useState(() => Date.now());
  // The hook can mount on a tab that is not Stats: re-take the fallback's "now" in the render where it becomes
  // enabled, so the first query is never for a window anchored at mount (React's adjust-state-during-render).
  const [wasEnabled, setWasEnabled] = React.useState(enabled);
  if (enabled && !wasEnabled) {
    setWasEnabled(true);
    setMountNow(Date.now());
  }
  const [notice, setNotice] = React.useState(() => parsePeriodParams(sp, mountNow).invalid);
  const [refreshFrom, setRefreshFrom] = React.useState<Period | null>(null);

  const parsed = React.useMemo(() => parsePeriodParams(new URLSearchParams(spText), mountNow), [spText, mountNow]);
  const hasPeriodParams = sp.get("range") !== null && !parsed.invalid;

  const replaceWith = React.useCallback(
    (next: Period) => {
      const qs = periodSearchParams(new URLSearchParams(spText), next).toString();
      router.replace(`${pathname}?${qs}`);
    },
    [router, pathname, spText],
  );

  const fallbackFrom = parsed.period.from;
  const fallbackTo = parsed.period.to;
  const invalid = parsed.invalid;
  React.useEffect(() => {
    if (!enabled || hasPeriodParams) return;
    if (invalid) setNotice(true);
    // The window already shown (its "now" was re-taken when the hook was enabled), so the URL write
    // never changes the query key a second time.
    replaceWith({ option: "30d", from: fallbackFrom, to: fallbackTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one write per missing/invalid URL
  }, [enabled, hasPeriodParams]);

  const select = React.useCallback(
    (next: Period) => {
      setRefreshFrom(null);
      setNotice(false);
      replaceWith(next);
    },
    [replaceWith],
  );

  const period = parsed.period;
  const refresh = React.useCallback(
    ({ isFetching, refetchSame }: { isFetching: boolean; refetchSame: () => void }) => {
      if (isFetching) return;
      if (period.option === "custom") {
        refetchSame();
        return;
      }
      setRefreshFrom(period);
      replaceWith(resolvePreset(period.option, Date.now()));
    },
    [period, replaceWith],
  );

  return {
    period: enabled ? period : null,
    option: period.option,
    notice,
    select,
    refresh,
    refreshFrom,
  };
}
