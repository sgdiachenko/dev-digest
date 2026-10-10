import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en/common.json";
import { TruncatedText } from "./TruncatedText";

afterEach(cleanup);

const LONG = "A very long agent name ".repeat(20).trim();

describe("TruncatedText", () => {
  it("is ellipsised when collapsed and shows the full text once expanded", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <TruncatedText text={LONG} />
      </NextIntlClientProvider>,
    );
    const text = screen.getByText(LONG);
    expect(text).toHaveStyle({ textOverflow: "ellipsis", whiteSpace: "nowrap" });

    const btn = screen.getByRole("button", { name: "Show full text" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);

    expect(screen.getByRole("button", { name: "Collapse text" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(LONG)).not.toHaveStyle({ textOverflow: "ellipsis" });
  });
});
