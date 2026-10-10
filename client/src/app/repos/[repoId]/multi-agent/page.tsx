import { Suspense } from "react";
import type { Metadata } from "next";
import { ConfigureForm } from "./_components/ConfigureForm";

/* Route: /repos/:repoId/multi-agent — Configure a multi-agent run. Thin entry:
   the form (AppShell, data, `?pr=` preselection) is colocated under
   _components/ConfigureForm. It reads route params and search params
   client-side, so it sits inside a <Suspense> boundary. */
export const metadata: Metadata = { title: "Multi-Agent Review — DevDigest" };

export default function MultiAgentConfigurePage() {
  return (
    <Suspense fallback={null}>
      <ConfigureForm />
    </Suspense>
  );
}
