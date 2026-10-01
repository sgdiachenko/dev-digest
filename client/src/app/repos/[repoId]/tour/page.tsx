import { Suspense } from "react";
import type { Metadata } from "next";
import { OnboardingTourView } from "./_components/OnboardingTourView";

/* Route: /repos/:repoId/tour — Onboarding Tour (facts-built sections). Thin
   entry: the view (AppShell, data, hash/scroll state) is colocated under
   _components/OnboardingTourView. The view reads route params client-side, so
   it sits inside a <Suspense> boundary. */
export const metadata: Metadata = { title: "Onboarding Tour — DevDigest" };

export default function OnboardingTourPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingTourView />
    </Suspense>
  );
}
