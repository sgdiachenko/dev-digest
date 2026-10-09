import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NAV } from "@devdigest/ui";
import shellMessages from "../../../messages/en/shell.json";
import { activeKeyFor } from "./helpers";
import { AppShell } from "./AppShell";

const mockPathname = "/eval";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: null, repos: [], activeRepo: null, setRepoId: vi.fn(), reposLoaded: true }),
}));
vi.mock("../../lib/hooks", () => ({
  usePulls: () => ({ data: undefined }),
  useDeleteRepo: () => ({ mutate: vi.fn() }),
}));

afterEach(cleanup);

function renderShell() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <AppShell>content</AppShell>
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
