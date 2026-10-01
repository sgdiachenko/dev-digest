import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Onboarding, OnboardingNarrative } from "@/lib/types";
import messages from "../../../../../../../messages/en/onboarding.json";
import { OnboardingTourView } from "./OnboardingTourView";

const h = vi.hoisted(() => ({
  refetch: vi.fn(),
  refreshMutate: vi.fn(),
  resyncMutate: vi.fn(),
  tour: {} as Record<string, unknown>,
  indexState: {} as Record<string, unknown>,
  pollArg: undefined as unknown,
  notFound: false,
  generateMutate: vi.fn(),
  generate: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "repo1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <p>repo missing</p> }));
vi.mock("@/components/mermaid-diagram/MermaidDiagram", () => ({ MermaidDiagram: () => <div /> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo1", full_name: "acme/app" } }),
  useRepoNotFound: () => h.notFound,
}));
vi.mock("@/lib/hooks", () => ({
  useRefreshRepo: () => ({ mutate: h.refreshMutate, isPending: false, isSuccess: false }),
}));
vi.mock("@/lib/hooks/tour", () => ({
  useRepoTour: () => h.tour,
  useGenerateNarrative: () => ({ mutate: h.generateMutate, isPending: false, error: null, ...h.generate }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: (_id: string, poll: boolean) => {
    h.pollArg = poll;
    return h.indexState;
  },
  useResyncRepoIntel: () => ({ mutate: h.resyncMutate, isPending: false }),
}));

function tourOf(o: Partial<Onboarding> = {}): Onboarding {
  return {
    repo_id: "repo1",
    availability: "available",
    source_sha: "abcdef0123456789",
    computed_at: "2026-10-01T10:00:00.000Z",
    index: {
      status: "full",
      reason: null,
      files_indexed: 10,
      files_in_repo: 10,
      graph_available: true,
      files_skipped_by_tour: 0,
    },
    sections: {
      architecture: { origin: "facts", summary: "", stack: [], modules: [], diagram: null },
      critical_paths: { origin: "facts", graph_based: true, items: [] },
      run_locally: {
        origin: "facts",
        groups: [
          {
            package_path: "",
            ecosystem: "node",
            commands: [
              {
                id: "c1",
                position: 1,
                phase: "install",
                command: "pnpm install",
                source_path: "package.json",
                source_key: null,
                by_convention: false,
                env_names: null,
                warnings: [],
              },
            ],
          },
        ],
      },
      reading_path: { origin: "facts", graph_based: true, items: [] },
      first_tasks: { origin: "facts", items: [] },
    },
    narrative: null,
    estimated_cost: null,
    ...o,
  };
}

function narrativeOf(o: Partial<OnboardingNarrative> = {}): OnboardingNarrative {
  return {
    status: "ready",
    generation_id: "g1",
    source_sha: "abcdef0123456789",
    outdated: false,
    generated_at: "2026-10-01T10:00:00.000Z",
    provider: "openrouter",
    model: "gpt-x",
    input_tokens: 1,
    output_tokens: 1,
    cost_usd: 0.01,
    last_failure: null,
    fallback_sections: [],
    sections: {
      architecture: null,
      critical_paths: null,
      run_locally: [{ command_id: "c1", position: 0, note: "Run this first" }],
      reading_path: null,
      first_tasks: null,
    },
    ...o,
  };
}

function setTour(data: Onboarding | undefined, extra: Record<string, unknown> = {}) {
  h.tour = {
    data,
    isPending: data === undefined && !extra.isError,
    isError: false,
    refetch: h.refetch,
    ...extra,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnboardingTourView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  h.refetch.mockReset();
  h.refreshMutate.mockReset();
  h.resyncMutate.mockReset();
  h.generateMutate.mockReset();
  h.generate = {};
  h.indexState = { data: undefined };
  h.pollArg = undefined;
  h.notFound = false;
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OnboardingTourView", () => {
  it("shows a skeleton per section and an operable nav while loading", () => {
    setTour(undefined);
    renderView();
    expect(screen.getByLabelText("Loading the tour").querySelectorAll("section")).toHaveLength(5);
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
  });

  it("shows the load error with Retry when there is no tour, and keeps the tour on a later error", () => {
    setTour(undefined, { isError: true });
    renderView();
    expect(screen.getByText("The tour could not be loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
    cleanup();

    setTour(tourOf(), { isError: true });
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("The tour could not be loaded");
    expect(screen.getByRole("heading", { name: "How to run locally" })).toBeInTheDocument();
  });

  it("not_cloned: Resync goes through the refresh mutation (D1) and reloads the tour on success", () => {
    setTour(tourOf({ availability: "not_cloned", sections: null, source_sha: null }));
    renderView();
    expect(screen.getByText("This repository is not cloned yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(h.refreshMutate).toHaveBeenCalledTimes(1);
    expect(h.refreshMutate.mock.calls[0]![0]).toBe("repo1");
    (h.refreshMutate.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess();
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("not_indexed: polls the index state and reloads the tour once the indexed SHA changes", () => {
    setTour(tourOf({ availability: "not_indexed", sections: null, source_sha: null }));
    h.indexState = { data: { lastIndexedSha: "" } };
    const view = renderView();
    expect(screen.getByText("Indexing — the tour appears when the index is ready")).toBeInTheDocument();
    expect(h.pollArg).toBe(true);
    expect(h.refetch).not.toHaveBeenCalled();

    h.indexState = { data: { lastIndexedSha: "" } };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView />
      </NextIntlClientProvider>,
    );
    expect(h.refetch).not.toHaveBeenCalled();

    h.indexState = { data: { lastIndexedSha: "deadbeef" } };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView />
      </NextIntlClientProvider>,
    );
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders five sections expanded, with a status banner whose Resync uses the refresh mutation", () => {
    setTour(tourOf({ index: { ...tourOf().index, status: "partial", reason: "time budget" } }));
    renderView();
    for (const name of ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"]) {
      expect(screen.getByRole("button", { name: `Collapse ${name}` })).toHaveAttribute("aria-expanded", "true");
    }
    expect(screen.getAllByText("From repository facts").length).toBeGreaterThanOrEqual(5);
    const banner = screen.getAllByRole("status").find((n) => n.textContent?.includes("Index is"))!;
    expect(banner).toHaveTextContent("Index is partial: time budget.");
    fireEvent.click(within(banner).getByRole("button", { name: "Resync" }));
    expect(h.resyncMutate).toHaveBeenCalledTimes(1);
    expect(h.refreshMutate).not.toHaveBeenCalled();
  });

  it("collapses and expands a section", () => {
    setTour(tourOf());
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Collapse First tasks" }));
    expect(screen.getByRole("button", { name: "Expand First tasks" })).toHaveAttribute("aria-expanded", "false");
  });

  it("On this page expands a collapsed section, scrolls, focuses the heading and sets the hash", () => {
    setTour(tourOf());
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Collapse How to run locally" }));
    fireEvent.click(screen.getByRole("link", { name: "How to run locally" }));
    expect(screen.getByRole("button", { name: "Collapse How to run locally" })).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
    expect(document.activeElement).toBe(document.getElementById("run-locally-heading"));
    expect(window.location.hash).toBe("#run-locally");
  });

  it("scrolls to a known hash once loaded and stays at the top for an unknown one", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, "", "/#reading-path");
    setTour(undefined);
    const view = renderView();
    expect(scroll).not.toHaveBeenCalled();
    setTour(tourOf());
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView />
      </NextIntlClientProvider>,
    );
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("reading-path");
    cleanup();

    scroll.mockClear();
    window.history.replaceState(null, "", "/#nope");
    setTour(tourOf());
    renderView();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("marks the section reported by the observer as current", () => {
    let cb: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(c: IntersectionObserverCallback) {
          cb = c;
        }
        observe() {}
        disconnect() {}
      },
    );
    setTour(tourOf());
    renderView();
    const target = document.getElementById("reading-path")!;
    act(() => cb([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.getByRole("link", { name: "Guided reading path" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Architecture overview" })).not.toHaveAttribute("aria-current");
  });

  it("announces a copied command in a polite live region", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    setTour(tourOf());
    renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy command/ }));
    });
    const live = screen.getAllByRole("status").filter((n) => n.getAttribute("aria-live") === "polite");
    expect(live.some((n) => n.textContent === "Copied")).toBe(true);
  });

  it("exports Markdown with the <repo>-onboarding-<sha7>.md file name", () => {
    setTour(tourOf());
    const urlApi = URL as unknown as Record<string, unknown>;
    urlApi.createObjectURL = vi.fn(() => "blob:x");
    urlApi.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Export as Markdown" }));
    expect(names).toEqual(["app-onboarding-abcdef0.md"]);
    expect(urlApi.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("Generate in the header starts a generation", () => {
    setTour(tourOf({ estimated_cost: { model: "gpt-x", approx_usd: 0.05 } }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Generate narrative" }));
    expect(h.generateMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("gpt-x · approx. $0.05")).toBeInTheDocument();
  });

  it("passes narrative to the sections: AI label and the note appear, the nav stays", () => {
    setTour(tourOf({ narrative: narrativeOf() }));
    renderView();
    expect(screen.getByText("Run this first")).toBeInTheDocument();
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
  });

  it("shows a Regenerating note over the current content and disables the button while generating", () => {
    setTour(tourOf({ narrative: narrativeOf({ status: "generating" }) }));
    renderView();
    expect(screen.getByText("Regenerating")).toBeInTheDocument();
    expect(screen.getByText("Run this first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  });

  function rerenderView(view: ReturnType<typeof renderView>) {
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView />
      </NextIntlClientProvider>,
    );
  }
  const polite = () =>
    screen
      .getAllByRole("status")
      .filter((n) => n.getAttribute("aria-live") === "polite")
      .map((n) => n.textContent);

  it("announces generating -> ready, without moving focus", () => {
    setTour(tourOf({ narrative: narrativeOf({ status: "generating" }) }));
    const view = renderView();
    const active = document.activeElement;
    expect(polite()).not.toContain("Narrative updated");
    setTour(tourOf({ narrative: narrativeOf() }));
    rerenderView(view);
    expect(polite()).toContain("Narrative updated");
    expect(document.activeElement).toBe(active);
  });

  it("announces generating -> failed and keeps the previous narrative and the failure visible", () => {
    setTour(tourOf({ narrative: narrativeOf({ status: "generating" }) }));
    const view = renderView();
    setTour(
      tourOf({
        narrative: narrativeOf({
          status: "failed",
          last_failure: { reason: "llm_timeout", at: "2026-10-01T10:05:00.000Z", provider: null, model: null },
        }),
      }),
    );
    rerenderView(view);
    expect(polite()).toContain("Generation failed");
    expect(screen.getByText("Generation timed out")).toBeInTheDocument();
    expect(screen.getByText("Run this first")).toBeInTheDocument();
    expect(screen.queryByText("Regenerating")).toBeNull();
  });

  it("does not announce on first load of a ready narrative", () => {
    setTour(tourOf({ narrative: narrativeOf() }));
    renderView();
    expect(polite()).not.toContain("Narrative updated");
  });

  it("Retry after a failure starts a new generation", () => {
    setTour(
      tourOf({
        narrative: narrativeOf({
          status: "failed",
          last_failure: { reason: "llm_error", at: "2026-10-01T10:05:00.000Z", provider: null, model: null },
        }),
      }),
    );
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.generateMutate).toHaveBeenCalledTimes(1);
  });

  it("shows the repo-not-found state for an unknown repository", () => {
    h.notFound = true;
    setTour(undefined);
    renderView();
    expect(screen.getByText("repo missing")).toBeInTheDocument();
  });
});
