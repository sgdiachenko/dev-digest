import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

import { MermaidDiagram } from "./MermaidDiagram";

describe("MermaidDiagram onInvalid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mermaid.parse.mockResolvedValue(true);
    mermaid.render.mockResolvedValue({ svg: "<svg data-testid='ok'></svg>" });
  });

  it("calls onInvalid and renders nothing for a non-diagram chart", async () => {
    const onInvalid = vi.fn();
    const { container } = render(<MermaidDiagram chart="just prose" onInvalid={onInvalid} />);
    await waitFor(() => expect(onInvalid).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
    expect(mermaid.parse).not.toHaveBeenCalled();
  });

  it("calls onInvalid when mermaid.parse rejects the chart", async () => {
    mermaid.parse.mockResolvedValue(false);
    const onInvalid = vi.fn();
    render(<MermaidDiagram chart="flowchart TD; A--" onInvalid={onInvalid} />);
    await waitFor(() => expect(onInvalid).toHaveBeenCalledTimes(1));
    expect(mermaid.render).not.toHaveBeenCalled();
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict" }),
    );
  });

  it("does not call onInvalid for a valid diagram", async () => {
    const onInvalid = vi.fn();
    const { container } = render(<MermaidDiagram chart="flowchart TD; A-->B" onInvalid={onInvalid} />);
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("still works without onInvalid", async () => {
    const { container } = render(<MermaidDiagram chart="nope" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("MermaidDiagram bare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mermaid.parse.mockResolvedValue(true);
    mermaid.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 640 200" style="max-width: 640px" width="100%"><g class="node"><rect/></g></svg>',
    });
  });

  it("adds a per-diagram theme and renders at natural size with rounded nodes", async () => {
    const { container } = render(<MermaidDiagram chart="flowchart LR; A-->B" bare />);
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    const rendered = mermaid.render.mock.calls[0]![1] as string;
    expect(rendered.startsWith("%%{init:")).toBe(true);
    expect(rendered.endsWith("flowchart LR; A-->B")).toBe(true);
    expect(mermaid.parse.mock.calls[0]![0]).toBe(rendered);
    const svg = container.querySelector("svg")!;
    await waitFor(() => expect(svg.style.maxWidth).toBe("none"));
    expect(svg.querySelector("rect")!.getAttribute("rx")).toBe("8");
  });

  it("leaves a non-bare diagram exactly as before (no directive, no restyling)", async () => {
    const { container } = render(<MermaidDiagram chart="flowchart LR; A-->B" />);
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(mermaid.render.mock.calls[0]![1]).toBe("flowchart LR; A-->B");
    expect(container.querySelector("svg")!.style.maxWidth).toBe("640px");
  });
});

