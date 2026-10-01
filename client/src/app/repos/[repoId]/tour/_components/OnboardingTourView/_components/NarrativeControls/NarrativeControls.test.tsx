import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { NarrativeControls } from "./NarrativeControls";

afterEach(cleanup);

function renderControls(props: Partial<React.ComponentProps<typeof NarrativeControls>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <NarrativeControls
        hasNarrative={false}
        generating={false}
        onGenerate={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("NarrativeControls", () => {
  it("offers Generate first, then Regenerate, and starts a generation on click", () => {
    const onGenerate = vi.fn();
    renderControls({ onGenerate });
    fireEvent.click(screen.getByRole("button", { name: "Generate narrative" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    cleanup();
    renderControls({ hasNarrative: true });
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
  });

  it("is disabled and reads Generating… while a generation runs", () => {
    renderControls({ generating: true, hasNarrative: true });
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  });

  it("shows a rate-limit message on 429 and keeps the button active", () => {
    renderControls({ error: new ApiError("too many", 429) });
    expect(screen.getByRole("alert")).toHaveTextContent("Too many generation requests");
    expect(screen.getByRole("button", { name: "Generate narrative" })).toBeEnabled();
  });

  it("shows no rate-limit message for other errors", () => {
    renderControls({ error: new ApiError("boom", 500) });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
