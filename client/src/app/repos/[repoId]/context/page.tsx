import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context — read-only Project Context catalog. Thin
   entry: the view (AppShell, data, filters in search params) is colocated under
   _components/ProjectContextView. The view reads useSearchParams, so it sits
   inside a <Suspense> boundary. */
export const metadata: Metadata = { title: "Project Context — DevDigest" };

export default function ProjectContextPage() {
  return (
    <Suspense fallback={null}>
      <ProjectContextView />
    </Suspense>
  );
}
