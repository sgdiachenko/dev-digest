import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NAV } from "@devdigest/ui";
import shellMessages from "../../../messages/en/shell.json";
import { activeKeyFor } from "./helpers";
import { AppShell } from "./AppShell";

const mockPathname = "/eval";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push }),
}));
vi.mock("../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: null, repos: [], activeRepo: null, setRepoId: vi.fn(), reposLoaded: true }),
}));
vi.mock("../../lib/hooks", () => ({
  usePulls: () => ({ data: undefined }),
  useDeleteRepo: () => ({ mutate: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

function renderShell(onRefresh?: () => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <AppShell onRefresh={onRefresh}>content</AppShell>
    </NextIntlClientProvider>,
  );
}

describe("Eval Dashboard sidebar item (AC-100, AC-101, NFR-16)", () => {
  it("sits right after Conventions with the Gauge icon and no shortcut", () => {
    const items = NAV.find((g) => g.section === "SKILLS LAB")!.items;
    const i = items.findIndex((it) => it.key === "conventions");
    const evalItem = items[i + 1]!;
    expect(evalItem).toMatchObject({ key: "eval", icon: "Gauge", href: "/eval" });
    expect(evalItem.gKey).toBeUndefined();
  });

  it("renders the label from messages as a link to /eval, and /eval is the active key", () => {
    renderShell();
    const link = screen.getByRole("link", { name: /Eval Dashboard/ });
    expect(link).toHaveAttribute("href", "/eval");
    expect(activeKeyFor("/eval")).toBe("eval");
  });

  it("takes the label from the message catalog, not the hardcoded fallback", () => {
    const messages = { shell: { ...shellMessages, nav: { ...shellMessages.nav, evalDashboard: "Evals (i18n)" } } };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppShell>content</AppShell>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("link", { name: /Evals \(i18n\)/ })).toBeInTheDocument();
  });
});

describe("Multi-Agent Review and Agent Performance sidebar items (AC-43, AC-98, NFR-11)", () => {
  it("GLOBAL holds multi-agent then agent-performance, with shell-catalog labels and hrefs", () => {
    const globals = NAV.filter((g) => g.section === "GLOBAL");
    expect(globals).toHaveLength(1);
    expect(globals[0]!.items.map((i) => i.key)).toEqual(["multi-agent", "agent-performance"]);
    expect(globals[0]!.items[0]).toMatchObject({ key: "multi-agent", href: "/repos/:repoId/multi-agent" });
    expect(globals[0]!.items[1]).toMatchObject({ href: "/agent-performance", gKey: "m" });

    const messages = { shell: { ...shellMessages, nav: { ...shellMessages.nav, "multi-agent": "Multi (i18n)" } } };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppShell>content</AppShell>
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole("link", { name: /Multi \(i18n\)/ });
    // No active repo in this test, so the :repoId token resolves to "_".
    expect(link).toHaveAttribute("href", "/repos/_/multi-agent");
    expect(screen.getByRole("link", { name: /Agent Performance/ })).toHaveAttribute("href", "/agent-performance");
  });
});

describe("g m shortcut (AC-188)", () => {
  it("navigates to /agent-performance on g then m, but not while typing in an input", () => {
    renderShell();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "m" });
    expect(push).toHaveBeenCalledWith("/agent-performance");

    push.mockReset();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(input, { key: "m" });
    expect(push).not.toHaveBeenCalled();
    input.remove();
  });
});

describe("Topbar Refresh (AC-56)", () => {
  it("shows a Refresh button that calls onRefresh, and none without the prop", () => {
    const onRefresh = vi.fn();
    const { unmount } = renderShell(onRefresh);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    unmount();

    renderShell();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });
});
