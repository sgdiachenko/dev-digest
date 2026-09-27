import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { BlastSymbolGroup } from "./BlastSymbolGroup";

afterEach(cleanup);

function group(o: Partial<DownstreamImpact> = {}): DownstreamImpact {
  return {
    symbol: "rateLimit",
    callers: [
      {
        name: "handler",
        file: "src/api/public/index.ts",
        line: 23,
        endpoints_affected: ["GET /api/public"],
        crons_affected: [],
      },
    ],
    endpoints_affected: ["GET /api/public"],
    crons_affected: [],
    ...o,
  };
}

function renderGroup(g: DownstreamImpact) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastSymbolGroup group={g} />
    </NextIntlClientProvider>,
  );
}

describe("BlastSymbolGroup", () => {
  it("defaults to expanded, then collapses/expands on click with a synced aria-expanded", () => {
    renderGroup(group());

    const toggle = screen.getByRole("button", { name: /rateLimit/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
  });

  it("renders an affected endpoint as a Badge pill, not a bare mono row", () => {
    renderGroup(group({ endpoints_affected: ["GET /api/public"] }));
    const endpoint = screen.getByText("GET /api/public");
    // Badge renders as a <span>; the old implementation rendered a bare <div>.
    expect(endpoint.tagName).toBe("SPAN");
  });
});
