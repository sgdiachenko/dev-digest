import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { layoutGraph } from "./helpers";
import { BlastSymbolGraph } from "./BlastSymbolGraph";

afterEach(cleanup);

// 1 symbol, 3 callers (one duplicated by name across two file:line rows), 2
// distinct endpoints across them — matches the plan's fixture shape.
const GROUP: DownstreamImpact = {
  symbol: "rateLimit",
  callers: [
    { name: "handlePublic", file: "src/api/public/index.ts", line: 23, endpoints_affected: ["GET /api/public"], crons_affected: [] },
    // Same caller NAME, different file:line row — must dedup into ONE graph node (E2).
    { name: "handlePublic", file: "src/api/public/other.ts", line: 5, endpoints_affected: ["GET /api/public"], crons_affected: [] },
    { name: "handleAdmin", file: "src/api/admin/index.ts", line: 8, endpoints_affected: ["GET /api/admin"], crons_affected: [] },
  ],
  endpoints_affected: ["GET /api/public", "GET /api/admin"],
  crons_affected: [],
};

describe("layoutGraph", () => {
  it("dedups caller rows by name and unions their endpoints into one target list", () => {
    const layout = layoutGraph(GROUP);
    const callerNodes = layout.nodes.filter((n) => n.kind === "caller");
    const targetNodes = layout.nodes.filter((n) => n.kind === "target");
    const symbolNodes = layout.nodes.filter((n) => n.kind === "symbol");

    // 3 caller ROWS but only 2 distinct caller NAMES → 2 caller nodes.
    expect(callerNodes).toHaveLength(2);
    expect(callerNodes.map((n) => n.label).sort()).toEqual(["handleAdmin", "handlePublic"]);
    expect(targetNodes).toHaveLength(2);
    expect(symbolNodes).toHaveLength(1);

    // Edges: symbol→each caller (2) + caller→its own target(s) (2, one per caller).
    expect(layout.edges).toHaveLength(4);
  });
});

function renderGraph(group: DownstreamImpact) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastSymbolGraph group={group} />
    </NextIntlClientProvider>,
  );
}

describe("BlastSymbolGraph", () => {
  it("renders every deduped node and the expected number of connecting lines", () => {
    const { container } = renderGraph(GROUP);
    // 1 symbol + 2 callers + 2 targets = 5 node badges.
    expect(container.querySelectorAll("svg line")).toHaveLength(4);
    expect(container.textContent).toContain("rateLimit");
    expect(container.textContent).toContain("handlePublic");
    expect(container.textContent).toContain("handleAdmin");
    expect(container.textContent).toContain("GET /api/public");
    expect(container.textContent).toContain("GET /api/admin");
  });
});
