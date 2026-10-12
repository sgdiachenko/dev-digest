import type { Metadata } from "next";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (Skills Lab). Stored CI runs, pulled from GitHub on Refresh. Thin entry. */
export const metadata: Metadata = { title: "CI Runs — DevDigest" };

export default function CiRunsPage() {
  return <CiRunsView />;
}
