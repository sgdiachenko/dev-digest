"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Patch = { agent?: string | null; compare?: string | null };

export interface DashboardUrl {
  agentId: string | null;
  /** `[older-or-newer, …]` exactly as written in `?compare=a,b`; null when absent or malformed. */
  compareIds: [string, string] | null;
  openAgent: (id: string) => void;
  selectAgent: (id: string) => void;
  backToOverview: () => void;
  openCompare: (a: string, b: string) => void;
  closeCompare: () => void;
}

/** The dashboard's state lives in the URL: `?agent=` and `?compare=` (AC-104, AC-128). */
export function useDashboardUrl(): DashboardUrl {
  const sp = useSearchParams();
  const router = useRouter();

  const agentId = sp.get("agent") || null;
  const parts = (sp.get("compare") ?? "").split(",").filter(Boolean);
  const compareIds: [string, string] | null = parts.length === 2 ? [parts[0]!, parts[1]!] : null;

  const hrefWith = (patch: Patch): string => {
    const next = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/eval?${qs}` : "/eval";
  };

  return {
    agentId,
    compareIds,
    openAgent: (id) => router.push(`/eval?agent=${encodeURIComponent(id)}`),
    selectAgent: (id) => router.replace(hrefWith({ agent: id, compare: null })),
    backToOverview: () => router.push("/eval"),
    openCompare: (a, b) => router.push(hrefWith({ compare: `${a},${b}` })),
    closeCompare: () => router.replace(hrefWith({ compare: null })),
  };
}
