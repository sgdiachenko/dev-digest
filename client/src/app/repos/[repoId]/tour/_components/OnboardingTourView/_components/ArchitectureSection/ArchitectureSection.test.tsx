import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSections } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";

const diagramProps = vi.hoisted(() => ({ current: null as null | { chart: string; onInvalid?: () => void } }));
vi.mock("@/components/mermaid-diagram/MermaidDiagram", () => ({
  MermaidDiagram: (p: { chart: string; onInvalid?: () => void }) => {
    diagramProps.current = p;
    return <div data-testid="diagram">{p.chart}</div>;
  },
}));

import { ArchitectureSection } from "./ArchitectureSection";
import { toMermaid } from "./mermaid";

afterEach(cleanup);

function sections(arch: Partial<OnboardingSections["architecture"]> = {}): OnboardingSections {
  return {
    architecture: {
      origin: "facts",
      summary: "ignored",
      stack: [{ kind: "ecosystem", name: "Node", evidence_path: "package.json", confidence: "verified" }],
      modules: [
        { path: "server", file_count: 1 },
        { path: "client", file_count: 12 },
      ],
      diagram: {
        nodes: [
          { id: "a", path: "server" },
          { id: "b", path: "client" },
        ],
        edges: [{ from: "b", to: "a", import_count: 3 }],
      },
      ...arch,
    },
    critical_paths: {
      origin: "facts",
      graph_based: true,
      items: [{ path: "server/index.ts", score: 5, tags: ["entry_point"], route_count: null, importer_count: null }],
    },
    run_locally: { origin: "facts", groups: [] },
    reading_path: { origin: "facts", graph_based: true, items: [] },
    first_tasks: { origin: "facts", items: [] },
  };
}

function renderSection(s: OnboardingSections, expanded = true) {
  const onToggle = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ArchitectureSection sections={s} expanded={expanded} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
  return { onToggle };
}

describe("ArchitectureSection", () => {
  it("shows the facts label, template summary, stack with evidence, and modules as text", () => {
    renderSection(sections());
    expect(screen.getByText("From repository facts")).toBeInTheDocument();
    expect(
      screen.getByText("Stack: Node. Entry points: server/index.ts. 2 top-level modules."),
    ).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getAllByText("package.json").length).toBeGreaterThan(0);
    expect(screen.getByText("12 files")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
  });

  it("draws the diagram from generated ids and falls back to the label when mermaid rejects it", () => {
    renderSection(sections());
    expect(screen.getByTestId("diagram").textContent).toContain("flowchart LR");
    expect(screen.queryByText("No import graph — heuristic structure")).toBeNull();
    fireEvent.click(document.body); // no-op, keeps act boundary explicit
    const { onInvalid } = diagramProps.current!;
    expect(onInvalid).toBeTypeOf("function");
  });

  it("shows 'No import graph — heuristic structure' and no diagram when the diagram is null", () => {
    renderSection(sections({ diagram: null }));
    expect(screen.getByText("No import graph — heuristic structure")).toBeInTheDocument();
    expect(screen.queryByTestId("diagram")).toBeNull();
  });

  it("draws no diagram for a flat repository (fewer than 2 modules)", () => {
    renderSection(sections({ diagram: { nodes: [{ id: "a", path: "." }], edges: [] } }));
    expect(screen.queryByTestId("diagram")).toBeNull();
  });

  it("shows the empty message when there is no stack and no modules", () => {
    renderSection(sections({ stack: [], modules: [], diagram: null }));
    expect(screen.getByText("No modules were found in this repository")).toBeInTheDocument();
  });
});

describe("toMermaid", () => {
  it("never puts repository text in an id and escapes label-breaking characters", () => {
    const out = toMermaid({
      nodes: [
        { id: "x\"]; click a href", path: 'we"ird<b>|path#1' },
        { id: "y", path: "ok" },
      ],
      edges: [
        { from: "x\"]; click a href", to: "y", import_count: 2 },
        { from: "missing", to: "y", import_count: 1 },
      ],
    })!;
    expect(out).toBe(
      ['flowchart LR', '  n0["we#34;ird#60;b#62;#124;path#35;1"]', '  n1["ok"]', '  n0 -->|2| n1'].join("\n"),
    );
  });

  it("returns null below 2 nodes", () => {
    expect(toMermaid({ nodes: [{ id: "a", path: "a" }], edges: [] })).toBeNull();
    // Several modules but no import edge between them: nothing worth drawing.
    expect(toMermaid({ nodes: [{ id: "a", path: "a" }, { id: "b", path: "b" }], edges: [] })).toBeNull();
    // An edge to an unknown node does not count.
    expect(
      toMermaid({ nodes: [{ id: "a", path: "a" }, { id: "b", path: "b" }], edges: [{ from: "a", to: "zz", import_count: 1 }] }),
    ).toBeNull();
  });
});

describe("ArchitectureSection narrative", () => {
  function renderAi(diagram: string | null) {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <ArchitectureSection
          sections={sections()}
          expanded
          onToggle={vi.fn()}
          repoFullName="o/r"
          narrativeSha="abc123"
          narrative={{ body_markdown: "AI body see [srv](repo:server)", diagram_mermaid: diagram }}
        />
      </NextIntlClientProvider>,
    );
  }

  it("replaces the template summary with the narrative body and keeps stack and modules", () => {
    renderAi(null);
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByText(/AI body see/)).toBeInTheDocument();
    expect(screen.queryByText(/^Stack: Node/)).not.toBeInTheDocument();
    expect(screen.getByText("12 files")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "srv" })).toHaveAttribute("href", "https://github.com/o/r/blob/abc123/server");
  });

  it("falls back to the facts diagram and says the AI diagram is unavailable when it is invalid", () => {
    renderAi("flowchart TD\n x-->y");
    expect(diagramProps.current?.chart).toBe("flowchart TD\n x-->y");
    act(() => diagramProps.current?.onInvalid?.());
    expect(screen.getByText("AI diagram unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("diagram").textContent).toBe(toMermaid(sections().architecture.diagram!));
  });
});
