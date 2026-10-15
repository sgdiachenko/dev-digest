import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { ShareDonut } from "./ShareDonut";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

describe("ShareDonut", () => {
  it("lists label, amount and share percent per entry (AC-132, NFR-13)", () => {
    renderWithMessages(
      <ShareDonut
        mode="usd"
        total={1}
        emptyText="No cost"
        entries={[
          { key: "a", label: "Security", value: 0.75 },
          { key: "b", label: "Performance", value: 0.25 },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Security")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("$0.75")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("75%")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("$0.25")).toBeInTheDocument();
  });

  it("groups beyond five into Other and keeps cents summing to the total (AC-133)", () => {
    const entries = [0.3, 0.25, 0.2, 0.1, 0.07, 0.05, 0.03].map((v, i) => ({ key: `k${i}`, label: `Agent ${i}`, value: v }));
    renderWithMessages(<ShareDonut mode="usd" total={1} emptyText="x" entries={entries} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(within(rows[5]!).getByText("Other")).toBeInTheDocument();
    expect(within(rows[5]!).getByText("$0.08")).toBeInTheDocument();
  });

  it("shows a sub-cent amount as < $0.01 (AC-135)", () => {
    renderWithMessages(
      <ShareDonut
        mode="usd"
        total={1.004}
        emptyText="x"
        entries={[
          { key: "a", label: "Big", value: 1 },
          { key: "b", label: "Tiny", value: 0.004 },
        ]}
      />,
    );
    expect(screen.getByText("< $0.01")).toBeInTheDocument();
  });

  it("count mode prints counts and no dollar sign (AC-154)", () => {
    renderWithMessages(
      <ShareDonut mode="count" total={12} emptyText="x" entries={[{ key: "s", label: "security", value: 9 }, { key: "b", label: "bug", value: 3 }]} />,
    );
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("replaces the ring with the empty text (AC-136)", () => {
    renderWithMessages(<ShareDonut mode="usd" total={0} emptyText="No cost recorded in this period" entries={[]} />);
    expect(screen.getByText("No cost recorded in this period")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
