import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import { IntentCard } from "./IntentCard";

const RECORD = {
  pr_id: "pr1",
  intent: "Add rate limiting to the public API.",
  in_scope: ["limiter"],
  out_of_scope: [],
  confidence: "high",
  sources: [],
  stale: false,
};

function mockIntent(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status < 400,
      status,
      statusText: "",
      json: async () => body,
    })),
  );
}

function renderCard(withSlot: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
        {withSlot ? (
          <IntentCard prId="pr1">
            <div>slot-content</div>
          </IntentCard>
        ) : (
          <IntentCard prId="pr1" />
        )}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntentCard — children slot and #intent anchor", () => {
  it("renders the slot inside section#intent in the empty (not derived) state", async () => {
    mockIntent(200, null);
    renderCard(true);
    await screen.findByText("Not derived yet");
    const section = document.getElementById("intent")!;
    expect(section.tagName).toBe("SECTION");
    expect(within(section).getByText("slot-content")).toBeInTheDocument();
  });

  it("renders the slot inside section#intent in the derived state, after the card", async () => {
    mockIntent(200, RECORD);
    renderCard(true);
    await screen.findByText("Add rate limiting to the public API.");
    const section = document.getElementById("intent")!;
    expect(within(section).getByText("slot-content")).toBeInTheDocument();
    const quote = within(section).getByText("Add rate limiting to the public API.");
    expect(quote.compareDocumentPosition(within(section).getByText("slot-content")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the anchor in the loading and error states and renders the slot in the error state", async () => {
    mockIntent(500, { error: { code: "x", message: "boom" } });
    renderCard(true);
    expect(document.getElementById("intent")).not.toBeNull(); // loading
    await screen.findByText("Couldn't load the PR's intent");
    expect(within(document.getElementById("intent")!).getByText("slot-content")).toBeInTheDocument();
  });

  it("adds nothing extra when there is no slot", async () => {
    mockIntent(200, null);
    renderCard(false);
    await screen.findByText("Not derived yet");
    const section = document.getElementById("intent")!;
    expect(screen.queryByText("slot-content")).toBeNull();
    // The label and content share one card, with no empty slot wrapper.
    expect(section.children).toHaveLength(1);
  });
});
