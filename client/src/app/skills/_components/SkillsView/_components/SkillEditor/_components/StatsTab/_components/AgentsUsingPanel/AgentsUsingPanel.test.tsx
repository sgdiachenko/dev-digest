import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { AgentsUsingPanel } from "./AgentsUsingPanel";
import { renderWithProviders } from "../../testing";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("AgentsUsingPanel", () => {
  it("lists 30 agents in the given order, each with an Open link to its Skills tab (AC-24, EC-24)", () => {
    const agents = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, name: `Agent ${String(i).padStart(2, "0")}` }));
    renderWithProviders(<AgentsUsingPanel agents={agents} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(30);
    expect(links[0]).toHaveAttribute("aria-label", "Open Agent 00");
    expect(links[0]).toHaveAttribute("href", "/agents/a0?tab=skills");
    expect(links[29]).toHaveAttribute("aria-label", "Open Agent 29");
    expect(links[0]).toHaveTextContent("Open");
  });

  it("shortens a long, markup-looking name but keeps the full text as plain text in the accessible name (EC-22, NFR-8)", () => {
    const LONG = "A very long agent name <img src=x onerror=alert(1)> that will not fit in the panel at all";
    renderWithProviders(<AgentsUsingPanel agents={[{ id: "a1", name: LONG }]} />);
    const panel = screen.getByRole("region", { name: "Agents using this skill" });
    const name = within(panel).getByLabelText(LONG, { selector: "span" });
    expect(name).toHaveStyle({ textOverflow: "ellipsis", whiteSpace: "nowrap" });
    expect(panel.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: `Open ${LONG}` })).toHaveAttribute("href", "/agents/a1?tab=skills");
    fireEvent.focus(name);
    expect(within(panel).getByRole("tooltip")).toHaveTextContent(LONG);
  });

  it("builds the href from the id only, with the id URL-encoded (C17)", () => {
    renderWithProviders(<AgentsUsingPanel agents={[{ id: "a b/../x", name: "Odd" }]} />);
    expect(screen.getByRole("link", { name: "Open Odd" })).toHaveAttribute("href", "/agents/a%20b%2F..%2Fx?tab=skills");
  });

  it("says the figures come from agents no longer linked when the list is empty (AC-25)", () => {
    renderWithProviders(<AgentsUsingPanel agents={[]} />);
    expect(
      screen.getByText("Not linked to any agent — the figures come from runs of agents that are no longer linked"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
