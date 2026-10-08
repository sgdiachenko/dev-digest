import type { Metadata } from "next";
import { Suspense } from "react";
import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval (Skills Lab). Overview of every agent, or one agent's runs via `?agent=<id>`
   (and the compare modal via `?compare=<a>,<b>`). Thin entry — `useSearchParams` in the view
   needs the Suspense boundary. */
export const metadata: Metadata = { title: "Eval Dashboard — DevDigest" };

export default function EvalPage() {
  return (
    <Suspense>
      <EvalDashboardView />
    </Suspense>
  );
}
