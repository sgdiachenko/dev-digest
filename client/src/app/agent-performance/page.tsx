import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

/* Route: /agent-performance. Runs, cost, speed and accept rate per agent over a period kept in the
   URL (`range`, `from`, `to`). Thin entry — `useSearchParams` in the view needs the Suspense boundary. */
export const metadata: Metadata = { title: "Agent Performance — DevDigest" };

export default function AgentPerformancePage() {
  return (
    <Suspense>
      <AgentPerformanceView />
    </Suspense>
  );
}
