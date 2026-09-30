import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentContextView, ContextCatalog } from "@/lib/types";
import messages from "../../../../../../../../messages/en/context.json";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";

// Only the data boundary is mocked: hooks return canned query/mutation state.
const h = vi.hoisted(() => ({
  catalog: {} as Record<string, unknown>,
  view: {} as Record<string, unknown>,
  save: {} as Record<string, unknown>,
  mutate: vi.fn(),
  catalogRepo: undefined as string | undefined,
  repo: { repoId: null as string | null, repos: [] as { id: string; full_name: string }[] },
}));

vi.mock("@/lib/hooks/context", () => ({
  useContextCatalog: (id: string) => {
    h.catalogRepo = id;
    return h.catalog;
  },
  useAgentContext: () => h.view,
  useSetAgentContext: () => ({ ...h.save, mutate: h.mutate }),
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => h.repo }));

import { ContextTab } from "./ContextTab";

const doc = (path: string, extra = {}) => ({
  path,
  category: "docs",
  est_tokens: 10,
  status: "ok",
  used_by: { agents: [], skills: [] },
  ...extra,
});
const CATALOG = {
  repo_id: R1,
  status: "ready",
  branch: "main",
  scanned_sha: "abcdef0123456789",
  scanned_at: null,
  total_files: 3,
  truncated: false,
  error: null,
  files: [doc("a.md"), doc("b.md"), doc("c.md")],
} as unknown as ContextCatalog;
const att = (repo_id: string, path: string, position: number, extra = {}) => ({
  repo_id,
  path,
  position,
  category: "docs",
  est_tokens: 10,
  status: "ok",
  would_skip: null,
  ...extra,
});
const VIEW: AgentContextView = {
  repo_id: R1,
  budget_tokens: 8000,
  total_est_tokens: 20,
  over_budget: false,
  own: [att(R1, "a.md", 0), att(R2, "other.md", 1), att(R1, "b.md", 2)],
  inherited: [],
} as unknown as AgentContextView;

function ok(data: unknown) {
  return { data, isLoading: false, isError: false, refetch: vi.fn() };
}

beforeEach(() => {
  h.mutate.mockReset();
  h.catalog = ok(CATALOG);
  h.view = ok(VIEW);
  h.save = { isPending: false, isSuccess: false, isError: false };
  h.repo = { repoId: R1, repos: [{ id: R1, full_name: "acme/one" }, { id: R2, full_name: "acme/two" }] };
});
afterEach(cleanup);

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("Agent ContextTab", () => {
  it("lists attached docs first and PUTs the full list across repos when attaching (AC-1, AC-3)", () => {
    mount();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByRole("checkbox", { name: "a.md" })).toBeChecked();
    expect(within(items[1]!).getByRole("checkbox", { name: "b.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "c.md" })).not.toBeChecked();
    expect(screen.getByText("≈ 20 / 8,000 tokens")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preview a.md" })).toHaveAttribute("href", `/repos/${R1}/context?doc=a.md`);

    fireEvent.click(screen.getByRole("checkbox", { name: "c.md" }));
    // The other repo's attachment stays in its slot; this repo's new order fills the rest.
    expect(h.mutate).toHaveBeenCalledWith([
      { repo_id: R1, path: "a.md" },
      { repo_id: R2, path: "other.md" },
      { repo_id: R1, path: "b.md" },
      { repo_id: R1, path: "c.md" },
    ]);
  });

  it("reorders within the selected repo only (AC-3)", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Move a.md down" }));
    expect(h.mutate).toHaveBeenCalledWith([
      { repo_id: R1, path: "b.md" },
      { repo_id: R2, path: "other.md" },
      { repo_id: R1, path: "a.md" },
    ]);
  });

  it("switching repository loads that repo's catalog and slice (AC-2, EC-6)", () => {
    mount();
    expect(h.catalogRepo).toBe(R1);
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: R2 } });
    expect(h.catalogRepo).toBe(R2);
  });

  it("shows the saved status, and retries the last failed body after an error (AC-12, EC-4)", () => {
    h.save = { isPending: false, isSuccess: false, isError: true };
    const { rerender } = mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "c.md" }));
    const body = h.mutate.mock.calls[0]![0];
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save attachments");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.mutate).toHaveBeenLastCalledWith(body);
    expect(h.mutate).toHaveBeenCalledTimes(2);

    h.save = { isPending: false, isSuccess: true, isError: false };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextTab agentId="ag1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("names skipped documents when over budget", () => {
    h.view = ok({
      ...VIEW,
      over_budget: true,
      own: [att(R1, "a.md", 0), att(R1, "b.md", 1, { would_skip: "over_budget" })],
    });
    mount();
    expect(screen.getByText(/these documents would be skipped: b\.md/)).toBeInTheDocument();
  });

  it("shows inherited docs with skill links, duplicate and inactive reasons (AC-11, EC-9, EC-10)", () => {
    const inh = (extra: object) => ({
      ...att(R1, "a.md", 0),
      skill_id: "sk1",
      skill_name: "Security",
      skill_active: true,
      skill_inactive_reason: null,
      duplicate: false,
      ...extra,
    });
    h.view = ok({
      ...VIEW,
      inherited: [
        inh({ path: "x.md" }),
        inh({ path: "y.md", skill_id: "sk2", skill_name: "Old", skill_active: false, skill_inactive_reason: "disabled" }),
        inh({ path: "a.md", duplicate: true }),
      ],
    });
    mount();
    expect(screen.getAllByRole("link", { name: "from skill Security" })[0]).toHaveAttribute("href", "/skills/sk1?tab=context");
    expect(screen.getByRole("link", { name: "from skill Old" })).toHaveAttribute("href", "/skills/sk2?tab=context");
    expect(screen.getByText("Skill is disabled — its documents are not injected")).toBeInTheDocument();
    expect(screen.getByText("Already attached — injected once")).toBeInTheDocument();
  });

  it("explains a not-cloned repository and links to Project Context (EC-5)", () => {
    h.catalog = ok({ ...CATALOG, status: "not_cloned", files: [] });
    mount();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Project Context" })).toHaveAttribute("href", `/repos/${R1}/context`);
  });

  it("explains an empty catalog (EC-1)", () => {
    h.catalog = ok({ ...CATALOG, files: [], total_files: 0 });
    h.view = ok({ ...VIEW, own: [] });
    mount();
    expect(screen.getByText("No documents to attach")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Project Context" })).toBeInTheDocument();
  });

  it("offers Retry when loading fails (EC-4)", () => {
    const refetch = vi.fn();
    h.view = { data: undefined, isLoading: false, isError: true, refetch };
    mount();
    expect(screen.getByText("Couldn't load attached documents")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows an empty state when no repository is selected (EC-6)", () => {
    h.repo = { repoId: null, repos: [] };
    mount();
    expect(screen.getByText("No repository selected")).toBeInTheDocument();
  });
});
