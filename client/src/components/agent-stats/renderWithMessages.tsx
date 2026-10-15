import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/agentPerformance.json";

/** Test helper: renders with the real `agentPerformance` catalog (client/INSIGHTS.md:41). */
export function renderWithMessages(ui: ReactElement): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}
