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
