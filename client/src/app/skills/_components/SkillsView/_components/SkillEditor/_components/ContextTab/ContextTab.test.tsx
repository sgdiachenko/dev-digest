import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/context.json";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";

const mutate = vi.fn();
let mutationState: { isPending: boolean; isError: boolean };
let viewData: unknown;
const catalogFor = (repoId: string) => ({
  data: {
    repo_id: repoId,
    status: "ready",
    branch: "main",
    scanned_sha: "abcdef0123456789",
    files: [
      { path: "a.md", category: "docs", est_tokens: 10, status: "ok" },
      { path: "b.md", category: "specs", est_tokens: 20, status: "ok" },
    ],
  },
  isLoading: false,
  isError: false,
});
const seenRepo: { catalog: string | null | undefined; view: string | null | undefined } = { catalog: null, view: null };

vi.mock("../../../../../../../../lib/hooks/context", () => ({
  useContextCatalog: (repoId: string) => {
    seenRepo.catalog = repoId;
    return catalogFor(repoId);
  },
  useSkillContext: (_id: string, repoId: string) => {
    seenRepo.view = repoId;
    return { data: viewData, isLoading: false, isError: false };
  },
  useSetSkillContext: () => ({ ...mutationState, mutate, reset: vi.fn() }),
}));
vi.mock("../../../../../../../../lib/hooks/core", () => ({
  useRepos: () => ({
    data: [
      { id: R1, full_name: "acme/one" },
      { id: R2, full_name: "acme/two" },
    ],
    isLoading: false,
  }),
}));
vi.mock("../../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: R1 }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function view(over: Partial<{ own: unknown[]; serialized: string }> = {}) {
  return {
    repo_id: R1,
    budget_tokens: 8000,
    total_est_tokens: 10,
    over_budget: false,
    own: [
      { repo_id: R1, path: "a.md", position: 0, category: "docs", est_tokens: 10, status: "ok", would_skip: null },
      { repo_id: R2, path: "z.md", position: 1, category: "docs", est_tokens: 5, status: "ok", would_skip: null },
    ],
    serialized: "<project_context>a</project_context>",
    serialized_est_tokens: 42,
    ...over,
  };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextTab skillId="sk1" />
    </NextIntlClientProvider>,
  );
}

describe("Skill editor › ContextTab", () => {
  it("attaching sends the full list (other repos preserved), shows serialized block, and follows the repo selector", () => {
    mutationState = { isPending: false, isError: false };
    viewData = view();
    renderTab();

    expect(screen.getByText("<project_context>a</project_context>")).toBeInTheDocument();
    expect(screen.getByText("≈ 42 tokens")).toBeInTheDocument();
    expect(screen.getByText(/every agent that uses this skill/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "b.md" }));
    expect(mutate.mock.calls[0]![0]).toEqual([
      { repo_id: R1, path: "a.md" },
      { repo_id: R2, path: "z.md" },
      { repo_id: R1, path: "b.md" },
    ]);

    expect(seenRepo.view).toBe(R1);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: R2 } });
    expect(seenRepo.view).toBe(R2);
    expect(seenRepo.catalog).toBe(R2);
  });

  it("shows the empty text instead of a block when nothing is serialized", () => {
    mutationState = { isPending: false, isError: false };
    viewData = view({ own: [], serialized: "" });
    renderTab();
    expect(screen.getByText("Nothing is added to the prompt")).toBeInTheDocument();
    expect(document.querySelector("pre")).toBeNull();
  });

  it("after a failed save, Retry re-sends the failed list", () => {
    mutationState = { isPending: false, isError: false };
    viewData = view();
    const { rerender } = renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "b.md" }));
    const failed = mutate.mock.calls[0]![0];

    mutationState = { isPending: false, isError: true };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextTab skillId="sk1" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1]![0]).toEqual(failed);
  });
});
