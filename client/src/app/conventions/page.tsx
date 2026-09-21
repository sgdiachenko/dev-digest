import type { Metadata } from "next";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /conventions (Skills Lab). Repo-scoped via the ACTIVE repo (repo
   switcher in the sidebar), not a :repoId URL param — matches /skills and
   /agents, the other Skills Lab pages. Thin route entry — the view, its
   card/modal, styles, constants, helpers and i18n are colocated under
   _components/ConventionsView. */
export const metadata: Metadata = { title: "Conventions — DevDigest" };

export default function ConventionsPage() {
  return <ConventionsView />;
}
