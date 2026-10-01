import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/context.json";
import { ApiError } from "@/lib/api";

const h = vi.hoisted(() => ({ state: {} as { data?: unknown; isLoading?: boolean; error?: unknown } }));
vi.mock("@/lib/hooks/context", () => ({
  useContextDoc: () => ({ data: undefined, isLoading: false, error: null, ...h.state }),
}));

import { ContextDocDrawer } from "./ContextDocDrawer";

afterEach(cleanup);

const doc = (o: Record<string, unknown> = {}) => ({
  path: "docs/a.md",
  category: "docs",
  est_tokens: 5,
  size: 10,
  status: "ok",
  sha: "abcdef0123456789",
  content: "# Doc A",
  secret_warning: false,
  ...o,
});

function setup() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocDrawer repoId="r1" path="docs/a.md" sha="abcdef0123456789" branch="main" onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("ContextDocDrawer", () => {
  it("shows loading, then markdown content with category badge and secret warning, and closes", () => {
    h.state = { isLoading: true };
    setup();
    expect(screen.getByRole("status", { name: "Loading document…" })).toBeInTheDocument();
    cleanup();

    h.state = { data: doc({ secret_warning: true }) };
    const onClose = setup();
    expect(screen.getByRole("heading", { name: "Doc A" })).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("Possible secret")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides the secret warning when the document has none", () => {
    h.state = { data: doc() };
    setup();
    expect(screen.queryByText("Possible secret")).not.toBeInTheDocument();
  });

  it("shows branch@sha for a 404 and a generic message for other errors", () => {
    h.state = { error: new ApiError("nf", 404) };
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Document not found in main@abcdef0");
    cleanup();

    h.state = { error: new ApiError("boom", 500) };
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this document");
  });

  it.each([
    ["empty", 0, "Empty document"],
    ["too_large", 2048, "Too large to preview (2.0 KB)"],
    ["unreadable", 512, "Couldn't read this document as text (512 B)"],
  ])("renders the %s status message instead of content", (status, size, text) => {
    h.state = { data: doc({ status, size, content: null }) };
    setup();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Doc A" })).not.toBeInTheDocument();
  });
});
