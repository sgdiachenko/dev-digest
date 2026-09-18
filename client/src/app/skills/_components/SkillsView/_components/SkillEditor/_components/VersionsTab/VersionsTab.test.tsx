import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";

const restoreMutate = vi.fn();
vi.mock("../../../../../../../../lib/hooks/skills", () => ({
  useSkill: () => ({ data: { id: "sk1", name: "pr-quality-rubric", version: 2, body: "current body" } }),
  useSkillVersions: () => ({
    data: [
      { skill_id: "sk1", version: 2, body: "current body", note: "Added tests dimension", created_at: "2026-05-30T00:00:00Z" },
      { skill_id: "sk1", version: 1, body: "initial body", note: "Initial version", created_at: "2026-03-02T00:00:00Z" },
    ],
    isLoading: false,
    isError: false,
  }),
  useSkillVersion: () => ({ data: undefined, isLoading: true }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersionsTab skillId="sk1" />
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab (smoke)", () => {
  it("marks the current version and hides Diff/Restore on it", () => {
    renderWithIntl();
    expect(screen.getByText("Current")).toBeInTheDocument();
    // Only the OLDER version (v1) gets Diff/Restore buttons.
    expect(screen.getAllByText("Diff")).toHaveLength(1);
    expect(screen.getAllByText("Restore")).toHaveLength(1);
  });

  it("shows each version's note and count", () => {
    renderWithIntl();
    expect(screen.getByText("Added tests dimension")).toBeInTheDocument();
    expect(screen.getByText("Initial version")).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
  });

  it("restoring a past version asks for confirmation before mutating", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl();
    fireEvent.click(screen.getByText("Restore"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(restoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 1 });
    confirmSpy.mockRestore();
  });

  it("declining the confirmation does not restore", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithIntl();
    fireEvent.click(screen.getByText("Restore"));
    expect(restoreMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
