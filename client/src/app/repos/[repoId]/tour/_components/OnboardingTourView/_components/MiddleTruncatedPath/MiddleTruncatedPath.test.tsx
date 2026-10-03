import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MiddleTruncatedPath } from "./MiddleTruncatedPath";

afterEach(cleanup);

describe("MiddleTruncatedPath", () => {
  it("shows the file name as its own tail and exposes the full path as tooltip and accessible text", () => {
    const path = "src/modules/very/deep/nesting/of/folders/handler.ts";
    const { container } = render(<MiddleTruncatedPath path={path} />);
    expect(container.querySelector("[title]")).toHaveAttribute("title", path);
    expect(screen.getByText(path)).toBeInTheDocument();
    expect(screen.getByText("/handler.ts")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("src/modules/very/deep/nesting/of/folders")).toHaveStyle({ textOverflow: "ellipsis" });
  });

  it("renders a short bare name without a tail", () => {
    const { container } = render(<MiddleTruncatedPath path="README.md" />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    expect(screen.getByText("README.md", { selector: ":not([aria-hidden])" })).toBeInTheDocument();
  });
});
