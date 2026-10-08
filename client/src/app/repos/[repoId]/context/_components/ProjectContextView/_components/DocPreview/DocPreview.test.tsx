import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import type { ContextDocContent } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/context.json";
import { DocPreview, type DocPreviewQuery } from "./DocPreview";

afterEach(cleanup);

function content(o: Partial<ContextDocContent>): ContextDocContent {
  return {
    path: "docs/guide.md",
    category: "docs",
    size: 42,
    est_tokens: 11,
    status: "ok",
    secret_warning: false,
    sha: "0123456789abcdef",
    content: "hello",
    ...o,
  };
}

function renderPreview(query: DocPreviewQuery, handlers = { onRescan: vi.fn(), onBack: vi.fn() }) {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <DocPreview
        query={query}
        scanRef={{ branch: "main", sha: "abcdef0123456789" }}
        rescanning={false}
        {...handlers}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, ...handlers };
}

describe("DocPreview — untrusted markdown", () => {
  it("neutralises javascript: links and data: images", () => {
    const { container } = renderPreview({
      isLoading: false,
      error: null,
      data: content({
        content: "[x](javascript:alert(1))\n\n![i](data:image/png;base64,AA)",
      }),
    });
    expect(screen.getByText("x").closest("a")).toHaveAttribute("href", "");
    const img = container.querySelector("img");
    expect(img?.getAttribute("src") ?? "").toBe("");
  });

  it("shows raw HTML as text and never creates script or b elements", () => {
    const { container } = renderPreview({
      isLoading: false,
      error: null,
      data: content({ content: "<script>alert(1)</script><b>x</b>" }),
    });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("DocPreview — states", () => {
  it("shows the header with a possible-secret warning", () => {
    renderPreview({ isLoading: false, error: null, data: content({ secret_warning: true }) });
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.getByText("≈11")).toBeInTheDocument();
    expect(screen.getByText("Possible secret")).toBeInTheDocument();
  });

  it("explains empty, too large and unreadable documents", () => {
    const { rerender } = renderPreview({
      isLoading: false,
      error: null,
      data: content({ status: "empty", size: 0, content: "" }),
    });
    expect(screen.getByText("Empty document")).toBeInTheDocument();

    const again = (data: ContextDocContent) =>
      rerender(
        <NextIntlClientProvider locale="en" messages={{ context: messages }}>
          <DocPreview
            query={{ isLoading: false, error: null, data }}
            scanRef={{ branch: "main", sha: "abcdef0123456789" }}
            rescanning={false}
            onRescan={vi.fn()}
            onBack={vi.fn()}
          />
        </NextIntlClientProvider>,
      );
    again(content({ status: "too_large", size: 70000, est_tokens: null, content: null }));
    expect(screen.getByText("Too large to preview (68.4 KB)")).toBeInTheDocument();
    again(content({ status: "unreadable", size: 900, est_tokens: null, content: null }));
    expect(screen.getByText("Couldn't read this document as text (900 B)")).toBeInTheDocument();
  });

  it("names branch@sha when the commit is unavailable and offers Rescan and back", () => {
    const { onRescan, onBack } = renderPreview({
      isLoading: false,
      error: new ApiError("gone", 404, "not_found", { reason: "commit_unavailable" }),
    });
    expect(screen.getByText("Document not found in main@abcdef0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(onRescan).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows a loading placeholder instead of stale content while fetching", () => {
    renderPreview({ isLoading: true, error: null });
    expect(screen.getByRole("status", { name: "Loading document…" })).toBeInTheDocument();
  });
});
