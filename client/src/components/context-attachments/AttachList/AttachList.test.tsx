import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/context.json";
import { AttachList, type AttachListProps } from "./AttachList";
import type { AttachRowData } from "../helpers";

afterEach(cleanup);

const REPO = "11111111-1111-4111-8111-111111111111";

function row(path: string, o: Partial<AttachRowData> = {}): AttachRowData {
  return {
    repo_id: REPO,
    path,
    attached: false,
    category: "docs",
    est_tokens: 12,
    status: "ok",
    would_skip: null,
    ...o,
  };
}

function setup(props: Partial<AttachListProps> = {}) {
  const onCommit = vi.fn();
  const onRetry = vi.fn();
  const base: AttachListProps = {
    rows: [row("a.md", { attached: true }), row("b.md", { attached: true }), row("c.md")],
    pending: false,
    status: "idle",
    error: false,
    catalogRef: { branch: "main", sha: "abcdef0123456789" },
    onCommit,
    onRetry,
    previewHref: (p) => `/context?doc=${encodeURIComponent(p)}`,
    ...props,
  };
  const ui = (p: AttachListProps) => (
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <AttachList {...p} />
    </NextIntlClientProvider>
  );
  const utils = render(ui(base));
  return { onCommit, onRetry, rerender: (p: Partial<AttachListProps>) => utils.rerender(ui({ ...base, ...p })) };
}

describe("AttachList long paths", () => {
  const LONG = `docs/${"very-long-directory-name/".repeat(6)}a-really-long-document-name-that-keeps-going.md`;

  it("elides the middle of a long path on screen but keeps the full path as the accessible name and tooltip", () => {
    setup({ rows: [row(LONG, { attached: true })] });
    // the checkbox is still named by the FULL path (screen readers, AC-15/NFR-6)
    const box = screen.getByRole("checkbox", { name: LONG });
    const label = box.closest("label") as HTMLElement;
    // what a sighted user sees is shorter, keeps the start and the file name, and has an ellipsis
    const visible = label.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(visible.textContent).toContain("…");
    expect(visible.textContent!.length).toBeLessThan(LONG.length);
    expect(visible.textContent).toMatch(/^docs\//);
    expect(visible.textContent).toMatch(/keeps-going\.md$/);
    expect(visible).toHaveAttribute("title", LONG);
  });

  it("leaves a short path untouched", () => {
    setup({ rows: [row("docs/short.md")] });
    const box = screen.getByRole("checkbox", { name: "docs/short.md" });
    const visible = (box.closest("label") as HTMLElement).querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(visible.textContent).toBe("docs/short.md");
  });
});

describe("AttachList", () => {
  it("lists attached documents first, names checkboxes by path, and reorders with Move down", () => {
    const { onCommit } = setup();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByRole("checkbox", { name: "a.md" })).toBeChecked();
    expect(within(items[2]!).getByRole("checkbox", { name: "c.md" })).not.toBeChecked();
    expect(within(items[0]!).getByText("Docs")).toBeInTheDocument();
    expect(within(items[0]!).getByText("≈12")).toBeInTheDocument();
    expect(within(items[0]!).getByRole("link", { name: "Preview a.md" })).toHaveAttribute("href", "/context?doc=a.md");
    expect(screen.getByRole("button", { name: "Move a.md up" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Move a.md down" }));
    expect(onCommit).toHaveBeenCalledWith([
      { repo_id: REPO, path: "b.md" },
      { repo_id: REPO, path: "a.md" },
    ]);
    // optimistic draft reorders the visible rows straight away
    expect(screen.getByRole("button", { name: "Move b.md up" })).toBeDisabled();
  });

  it("appends a newly checked document and shows pending then Saved in a status region", () => {
    const { onCommit, rerender } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "c.md" }));
    expect(onCommit).toHaveBeenCalledWith([
      { repo_id: REPO, path: "a.md" },
      { repo_id: REPO, path: "b.md" },
      { repo_id: REPO, path: "c.md" },
    ]);
    rerender({ pending: true });
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    expect(screen.getByRole("checkbox", { name: "a.md" })).toBeDisabled();
    rerender({
      pending: false,
      status: "saved",
      rows: [row("a.md", { attached: true }), row("b.md", { attached: true }), row("c.md", { attached: true })],
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("checkbox", { name: "c.md" })).toBeChecked();
  });

  it("rolls back to the confirmed list on error and Retry re-sends", () => {
    const { onRetry, rerender } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "c.md" }));
    expect(screen.getByRole("checkbox", { name: "c.md" })).toBeChecked();
    rerender({ pending: true });
    rerender({ pending: false, error: true });
    expect(screen.getByRole("checkbox", { name: "c.md" })).not.toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent("The list was reverted");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers Detach for a document that left the catalog, with where it was not found", () => {
    const { onCommit } = setup({
      rows: [row("gone.md", { attached: true, status: "missing", category: null, est_tokens: null }), row("b.md", { attached: true })],
    });
    expect(screen.getByText("Not found in main@abcdef0")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Preview gone.md" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detach gone.md" }));
    expect(onCommit).toHaveBeenCalledWith([{ repo_id: REPO, path: "b.md" }]);
    expect(screen.queryByText("gone.md")).not.toBeInTheDocument();
  });

  it("blocks too_large and unreadable documents with a reason", () => {
    const { onCommit } = setup({
      rows: [row("big.md", { status: "too_large", est_tokens: null }), row("bin.md", { status: "unreadable", est_tokens: null })],
    });
    expect(screen.getByRole("checkbox", { name: "big.md" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "bin.md" })).toBeDisabled();
    expect(screen.getByText("Too large to attach")).toBeInTheDocument();
    expect(screen.getByText(/Not readable as text/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "big.md" }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("filters by path and shows an empty state when nothing matches", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents by path" }), { target: { value: "B.M" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents by path" }), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No documents match “zzz”.")).toBeInTheDocument();
  });

  it("disables every control while loading", () => {
    setup({ loading: true });
    for (const cb of screen.getAllByRole("checkbox")) expect(cb).toBeDisabled();
    for (const b of screen.getAllByRole("button", { name: /Move/ })) expect(b).toBeDisabled();
  });

  it("shows a skeleton and no empty message while loading with no rows", () => {
    setup({ loading: true, rows: [] });
    expect(screen.queryByText("No documents to attach")).not.toBeInTheDocument();
  });
});
