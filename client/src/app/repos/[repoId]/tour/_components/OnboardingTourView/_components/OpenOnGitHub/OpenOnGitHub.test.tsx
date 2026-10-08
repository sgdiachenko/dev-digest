import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { OpenOnGitHub } from "./OpenOnGitHub";

afterEach(cleanup);

function renderLink(props: Partial<React.ComponentProps<typeof OpenOnGitHub>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OpenOnGitHub repoFullName="o/r" sha="abc123" path="a b/c#d.ts" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("OpenOnGitHub", () => {
  it("links to the blob at the given sha with encoded segments, in a new tab", () => {
    renderLink();
    const link = screen.getByRole("link", { name: "Open a b/c#d.ts on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/o/r/blob/abc123/a%20b/c%23d.ts");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links a directory to the tree, and honours a different (narrative) sha", () => {
    renderLink({ kind: "directory", path: "docs", sha: "old999" });
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://github.com/o/r/tree/old999/docs");
  });
});
