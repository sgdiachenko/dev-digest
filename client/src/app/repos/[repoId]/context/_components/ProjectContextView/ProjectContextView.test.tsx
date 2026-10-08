import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextCatalog, ContextDoc } from "@/lib/types";
import messages from "../../../../../../../messages/en/context.json";
import { ProjectContextView } from "./ProjectContextView";

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  refetch: vi.fn(),
  rescanMutate: vi.fn(),
  refreshMutate: vi.fn(),
  search: "",
  catalog: {} as Record<string, unknown>,
  doc: {} as Record<string, unknown>,
  rescan: {} as Record<string, unknown>,
  docHook: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1" }),
  useRouter: () => ({ replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo1", full_name: "acme/app" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks", () => ({
  useRefreshRepo: () => ({ mutate: h.refreshMutate, isPending: false, isSuccess: false }),
}));
vi.mock("@/lib/hooks/context", () => ({
  useContextCatalog: () => h.catalog,
  useContextDoc: (...args: unknown[]) => {
    h.docHook(...args);
    return h.doc;
  },
  useRescanContext: () => h.rescan,
}));

function doc(path: string, category: ContextDoc["category"] = "docs"): ContextDoc {
  return { path, category, size: 100, est_tokens: 25, status: "ok", secret_warning: false, used_by: { agents: [], skills: [] } };
}

function catalogOf(o: Partial<ContextCatalog>): ContextCatalog {
  return {
    repo_id: "repo1",
    status: "ready",
    branch: "main",
    scanned_sha: "abcdef0123456789",
    scanned_at: "2026-09-30T11:00:00.000Z",
    total_files: 2,
    truncated: false,
    error: null,
    files: [doc("zeta/b.md"), doc("alpha/a.md", "specs")],
    ...o,
  };
}

function ready(data: ContextCatalog) {
  h.catalog = { data, isPending: false, isError: false, refetch: h.refetch };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  h.search = "";
  h.doc = { data: undefined, isLoading: false, error: null };
  h.rescan = { mutate: h.rescanMutate, isPending: false, isError: false, error: null };
  ready(catalogOf({}));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectContextView — catalog", () => {
  it("lists documents in server order, selects one via the URL and offers no editing", () => {
    renderView();
    const rows = screen.getAllByRole("button", { name: /\.md$/ });
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["zeta/b.md", "alpha/a.md"]);
    expect(screen.getByText(/2 files · scanned/)).toBeInTheDocument();
    expect(screen.getByText("main@abcdef0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|upload|new|delete/i })).toBeNull();

    fireEvent.click(rows[1]!);
    expect(h.replace).toHaveBeenCalledWith("/repos/repo1/context?doc=alpha%2Fa.md");
  });

  it("shows skeletons while the first load is pending", () => {
    h.catalog = { data: undefined, isPending: true, isError: false, refetch: h.refetch };
    const { container } = renderView();
    expect(container.querySelectorAll(".skeleton")).toHaveLength(8);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("filters by the q search param and can clear filters from the no-match state", () => {
    h.search = "q=nothing-like-this";
    renderView();
    expect(screen.getByText("No documents match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(h.replace).toHaveBeenCalledWith("/repos/repo1/context");
  });

  it("writes typed filters to the URL", () => {
    renderView();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter documents by path" }), {
      target: { value: "alp" },
    });
    expect(h.replace).toHaveBeenCalledWith("/repos/repo1/context?q=alp");
    fireEvent.click(screen.getByRole("button", { name: "Specs" }));
    expect(h.replace).toHaveBeenLastCalledWith("/repos/repo1/context?cat=specs");
  });

  it("tells the user when the list was truncated", () => {
    ready(catalogOf({ truncated: true, total_files: 1200 }));
    renderView();
    expect(screen.getByText("Showing first 1,000 of 1,200")).toBeInTheDocument();
  });

  it("points at .devdigest/specs/ when the repo has no documents", () => {
    ready(catalogOf({ files: [], total_files: 0 }));
    renderView();
    expect(screen.getByText(/\.devdigest\/specs\//)).toBeInTheDocument();
    const empty = screen.getByText("No documents found").parentElement as HTMLElement;
    fireEvent.click(within(empty).getByRole("button", { name: "Rescan" }));
    expect(h.rescanMutate).toHaveBeenCalledTimes(1);
  });

  it("states how long ago the catalog was scanned (AC-18)", () => {
    ready(catalogOf({ scanned_at: new Date(Date.now() - 30 * 60_000).toISOString() }));
    renderView();
    expect(screen.getByText(/scanned 30m ago/)).toBeInTheDocument();
  });

  it("keeps showing the scanned version and never refetches on its own (EC-3)", () => {
    ready(catalogOf({}));
    renderView();
    expect(screen.getByText(/main@abcdef0/)).toBeInTheDocument();
    expect(h.rescanMutate).not.toHaveBeenCalled();
  });
});

describe("ProjectContextView — states", () => {
  it("offers Resync for a repository that is not cloned", () => {
    ready(catalogOf({ status: "not_cloned", files: [], total_files: 0 }));
    renderView();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(h.refreshMutate).toHaveBeenCalledWith("repo1");
  });

  it("disables Rescan and says Rescanning while a scan runs", () => {
    ready(catalogOf({ status: "scanning" }));
    renderView();
    expect(screen.getByRole("button", { name: "Rescanning…" })).toBeDisabled();
  });

  it("keeps the list under an error banner when a refetch fails but data exists", () => {
    h.catalog = { data: catalogOf({}), isPending: false, isError: true, refetch: h.refetch };
    renderView();
    expect(screen.getByText("Couldn't load documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "zeta/b.md" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a full error state with Retry when nothing was ever loaded", () => {
    h.catalog = { data: undefined, isPending: false, isError: true, refetch: h.refetch };
    renderView();
    expect(screen.getByText("Couldn't load documents")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the scan failure reason above the previous list and retries via rescan", () => {
    ready(catalogOf({ status: "error", error: "git fetch failed" }));
    renderView();
    expect(screen.getByText("Last scan failed: git fetch failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "zeta/b.md" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.rescanMutate).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectContextView — preview", () => {
  it("fetches only the document named in the URL, keyed by the scanned sha", () => {
    h.search = "doc=alpha%2Fa.md";
    h.doc = { data: undefined, isLoading: true, error: null };
    const { rerender } = renderView();
    expect(h.docHook).toHaveBeenLastCalledWith("repo1", "alpha/a.md", "abcdef0123456789");
    expect(screen.getByRole("status", { name: "Loading document…" })).toBeInTheDocument();

    h.search = "doc=zeta%2Fb.md";
    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ProjectContextView />
      </NextIntlClientProvider>,
    );
    expect(h.docHook).toHaveBeenLastCalledWith("repo1", "zeta/b.md", "abcdef0123456789");
  });

  it("prompts to select a document when none is chosen", () => {
    renderView();
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();
  });
});

describe("ProjectContextView — used by", () => {
  it("shows 'Not used' for an unattached doc, a summary + link list for used ones, Esc returns focus", () => {
    const used: ContextDoc = {
      ...doc("alpha/a.md", "specs"),
      used_by: { agents: [{ id: "a1", name: "Reviewer" }], skills: [{ id: "s1", name: "Security" }, { id: "s2", name: "Perf" }] },
    };
    ready(catalogOf({ files: [doc("zeta/b.md"), used, { ...doc("c.md"), used_by: null }] }));
    renderView();
    expect(screen.getByText("Not used")).toBeInTheDocument();
    expect(screen.getByText("Usage unavailable")).toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Used by 1 agent · 2 skills" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Reviewer" })).toHaveAttribute("href", "/agents/a1?tab=context");
    expect(screen.getByRole("link", { name: "Perf" })).toHaveAttribute("href", "/skills/s2?tab=context");

    const link = screen.getByRole("link", { name: "Security" });
    link.focus();
    fireEvent.keyDown(link, { key: "Escape" });
    expect(screen.queryByRole("link")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("lists every user of a widely used document in a scrollable list (EC-16)", () => {
    const agents = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, name: `Agent ${i}` }));
    const widely: ContextDoc = { ...doc("shared.md", "docs"), used_by: { agents, skills: [] } };
    ready(catalogOf({ files: [widely] }));
    renderView();
    const trigger = screen.getByRole("button", { name: "Used by 12 agents · 0 skills" });
    fireEvent.click(trigger);
    expect(screen.getAllByRole("link")).toHaveLength(12);
    expect(screen.getByRole("link", { name: "Agent 11" })).toHaveAttribute("href", "/agents/a11?tab=context");
    // the list is the trigger's controlled region and is height-limited and scrollable
    const list = document.getElementById(trigger.getAttribute("aria-controls") as string) as HTMLElement;
    expect(list).toHaveStyle({ overflowY: "auto" });
    expect(list.style.maxHeight).not.toBe("");
  });
});
