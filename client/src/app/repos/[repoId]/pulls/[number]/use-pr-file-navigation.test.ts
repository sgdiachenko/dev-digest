import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../messages/en/brief.json";

const push = vi.fn();
const replace = vi.fn();
let query = "tab=overview";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

import { usePrFileNavigation } from "./use-pr-file-navigation";

// A .ts file has no JSX; the provider type requires `children` inside its props.
const wrapper = ({ children }: { children: React.ReactNode }) =>
  // eslint-disable-next-line react/no-children-prop
  React.createElement(NextIntlClientProvider, { locale: "en", messages: { brief: briefMessages }, children });
const setup = () =>
  renderHook(() => usePrFileNavigation({ repoId: "r1", number: "7", changedFiles: ["src/a.ts"] }), { wrapper });

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  query = "tab=overview";
});

describe("usePrFileNavigation", () => {
  it("pushes (not replaces) a Files-tab URL for a PR file", () => {
    const { result } = setup();
    act(() => result.current.openFile("src/a.ts", 12));
    expect(replace).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0]![0] as string, "http://x");
    expect(url.pathname).toBe("/repos/r1/pulls/7");
    expect(url.searchParams.get("tab")).toBe("diff");
    expect(url.searchParams.get("file")).toBe("src/a.ts");
    expect(url.searchParams.get("line")).toBe("12");
    expect(result.current.statusMessage).toBeNull();
  });

  it("restores the Overview target after browser Back", () => {
    const { result, rerender } = setup();
    const overviewQuery = query;
    act(() => result.current.openFile("src/a.ts", 12));
    query = new URL(push.mock.calls[0]![0] as string, "http://x").search.slice(1);
    rerender();
    expect(result.current.target).toMatchObject({ path: "src/a.ts", line: 12 });

    // Browser Back restores the prior URL, which makes Overview the active tab.
    query = overviewQuery;
    rerender();
    expect(new URLSearchParams(query).get("tab")).toBe("overview");
    expect(result.current.target).toBeNull();
  });

  it("does not navigate for a file outside the PR and announces it", () => {
    const { result } = setup();
    act(() => result.current.openFile("src/other.ts", 3));
    expect(push).not.toHaveBeenCalled();
    expect(result.current.statusMessage).toBe("File not in this PR's diff");
  });

  it("exposes the URL target, and announces a shared URL naming a foreign file", () => {
    query = "tab=diff&file=src/a.ts&line=0";
    expect(setup().result.current.target).toMatchObject({ path: "src/a.ts", line: null });

    query = "tab=diff&file=nope.ts";
    const { result } = setup();
    expect(result.current.target).toBeNull();
    expect(result.current.statusMessage).toBe("File not in this PR's diff");
  });
});
