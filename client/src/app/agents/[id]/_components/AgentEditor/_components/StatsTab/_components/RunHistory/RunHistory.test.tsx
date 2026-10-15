import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { RunHistory } from "./RunHistory";
import { apiError, callsTo, fetchMock, json, makePage, makeRun, renderWithProviders, routeFetch } from "../../testing";

vi.stubGlobal("fetch", fetchMock);

const PERIOD = { from: "2026-09-15T12:00:00.000Z", to: "2026-10-15T12:00:00.000Z" };
const PATH = "/agents/ag1/stats/runs";

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(cleanup);

describe("RunHistory", () => {
  it("lists runs with the cost label, PR links, trace links and dashes for missing values", async () => {
    routeFetch({
      [PATH]: () =>
        json({
          items: [
            makeRun(1),
            makeRun(2, { status: "failed", tokens_in: 900, tokens_out: 100, cost_usd: null, findings_count: null }),
            makeRun(3, { repo_id: null, repo_full_name: null, pr_number: null, cost_usd: null }),
          ],
          page: 1,
          page_size: 20,
          total: 3,
        }),
    });
    renderWithProviders(<RunHistory agentId="ag1" period={PERIOD} timeZone="UTC" />);

    await screen.findAllByRole("link", { name: /acme\/payments-api/ });
    expect(screen.getAllByRole("row")).toHaveLength(4);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.join("|")).toContain("Status");
    expect(screen.queryByText(/source/i)).toBeNull();
    // AC-193: the Cost header carries the cost label.
    const costHeader = screen.getByRole("columnheader", { name: /Cost/ });
    expect(within(costHeader).getByText("Recorded by DevDigest — not provider billing")).toBeInTheDocument();

    const [, row1, row2, row3] = screen.getAllByRole("row");
    // AC-157 / AC-160: links are built from the stored ids.
    const prLink = within(row1!).getByRole("link", { name: /acme\/payments-api/ });
    expect(prLink).toHaveAttribute("href", "/repos/repo-1/pulls/479");
    expect(within(row1!).getByRole("link", { name: /View trace/ })).toHaveAttribute(
      "href",
      "/repos/repo-1/pulls/479?trace=run-1",
    );
    // AC-159: tokens in thousands; EC-45: a failed run shows a dash.
    expect(within(row1!).getByText("16k")).toBeInTheDocument();
    expect(within(row2!).queryByText("1k")).toBeNull();
    expect(within(row2!).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    // AC-194: unknown cost is a dash, never $0.00.
    expect(screen.queryByText(/\$0\.00\b/)).toBeNull();
    // AC-161 / EC-42: no PR → dash and no trace link.
    expect(within(row3!).queryByRole("link")).toBeNull();
    expect(within(row3!).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("pages with one request per page and shows the n–m of total range", async () => {
    routeFetch({
      [PATH]: (url) => {
        const page = Number(url.searchParams.get("page"));
        return json(page === 2 ? makePage(2, 5, 25) : makePage(1, 20, 25));
      },
    });
    renderWithProviders(<RunHistory agentId="ag1" period={PERIOD} timeZone="UTC" />);

    expect(await screen.findByText("1–20 of 25")).toBeInTheDocument();
    // NFR-6: 20 rows (plus the header row).
    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("21–25 of 25")).toBeInTheDocument();
    expect(callsTo(PATH)).toHaveLength(2);
    expect(new URL(callsTo(PATH)[1]![0] as string).searchParams.get("page")).toBe("2");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows an in-section error with Retry when a page fails", async () => {
    let fail = true;
    routeFetch({ [PATH]: () => (fail ? apiError(500, "internal", "boom") : json(makePage(1, 2, 2))) });
    renderWithProviders(<RunHistory agentId="ag1" period={PERIOD} timeZone="UTC" />);

    expect(await screen.findByText("Couldn't load the run history")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
  });
});
