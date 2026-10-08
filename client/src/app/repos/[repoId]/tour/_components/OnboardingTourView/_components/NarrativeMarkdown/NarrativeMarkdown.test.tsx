import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NarrativeMarkdown } from "./NarrativeMarkdown";

const SHA = "a".repeat(40);

function renderMd(md: string) {
  return render(<NarrativeMarkdown repoFullName="acme/app" sha={SHA} >{md}</NarrativeMarkdown>);
}

describe("NarrativeMarkdown", () => {
  it("turns repo: links into SHA-pinned GitHub links and drops every other href", () => {
    const { container } = renderMd(
      [
        "[file](repo:src/my%20dir/a.ts)",
        "[dir](repo:src/lib/)",
        "[js](javascript:alert(1))",
        "[data](data:text/html;base64,AAAA)",
        "[ext](https://evil.example/x)",
      ].join("\n\n"),
    );

    const file = screen.getByRole("link", { name: "file" });
    expect(file.getAttribute("href")).toBe(`https://github.com/acme/app/blob/${SHA}/src/my%20dir/a.ts`);
    expect(file.getAttribute("target")).toBe("_blank");
    expect(file.getAttribute("rel")).toBe("noopener noreferrer");

    expect(screen.getByRole("link", { name: "dir" }).getAttribute("href")).toBe(
      `https://github.com/acme/app/tree/${SHA}/src/lib`,
    );

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(container.querySelector("a[href^='javascript:'], a[href^='data:'], a[href^='https://evil']")).toBeNull();
    expect(screen.getByText(/js/)).toBeTruthy();
    expect(screen.getByText(/ext/)).toBeTruthy();
  });

  it("decodes server-encoded paths and renders a malformed escape as plain text", () => {
    renderMd("[p](repo:src/a%20%28b%29/c%20d.ts)\n\n[bad](repo:src/%E0%A4%A.ts)");
    expect(screen.getByRole("link", { name: "p" }).getAttribute("href")).toBe(
      `https://github.com/acme/app/blob/${SHA}/src/a%20(b)/c%20d.ts`,
    );
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.getByText("bad")).toBeTruthy();
  });

  it("renders raw HTML as text, not elements", () => {
    const { container } = renderMd("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(container.querySelector("script, img")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });
});
