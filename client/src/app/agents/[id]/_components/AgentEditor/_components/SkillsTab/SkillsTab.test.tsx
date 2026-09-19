import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/agents.json";

const setSkillsMutate = vi.fn();
let agentSkillsResult: { data: unknown; isLoading: boolean; isError: boolean };
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => agentSkillsResult,
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [
      { id: "s-rubric", name: "pr-quality-rubric", description: "PR quality", type: "rubric", enabled: true },
      { id: "s-secret", name: "secret-leakage-gate", description: "Secret scanning", type: "security", enabled: true },
      { id: "s-tests", name: "test-coverage-nudge", description: "Test coverage", type: "custom", enabled: false },
    ],
    isLoading: false,
    isError: false,
  }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab (agent editor) — smoke", () => {
  it("checking an unlinked skill posts the full ordered set, appending at the end", () => {
    agentSkillsResult = {
      isLoading: false,
      isError: false,
      data: [{ agent_id: "ag1", skill_id: "s-rubric", order: 0 }],
    };
    renderWithIntl();

    // secret-leakage-gate is unlinked — check it.
    const secretRow = screen.getByText("secret-leakage-gate").closest("label")!;
    fireEvent.click(secretRow.querySelector('[role="checkbox"]')!);

    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s-rubric", "s-secret"] });
  });

  it("unchecking a linked skill removes it and keeps the rest in order", () => {
    agentSkillsResult = {
      isLoading: false,
      isError: false,
      data: [
        { agent_id: "ag1", skill_id: "s-rubric", order: 0 },
        { agent_id: "ag1", skill_id: "s-secret", order: 1 },
      ],
    };
    renderWithIntl();

    const rubricRow = screen.getByText("pr-quality-rubric").closest("label")!;
    fireEvent.click(rubricRow.querySelector('[role="checkbox"]')!);

    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s-secret"] });
  });

  it("dragging a linked skill reorders and posts the new full set", () => {
    agentSkillsResult = {
      isLoading: false,
      isError: false,
      data: [
        { agent_id: "ag1", skill_id: "s-rubric", order: 0 },
        { agent_id: "ag1", skill_id: "s-secret", order: 1 },
      ],
    };
    renderWithIntl();

    const transfer = { effectAllowed: "move", dropEffect: "move", setData: vi.fn() };
    fireEvent.dragStart(screen.getByTestId("agent-skill-s-rubric"), { dataTransfer: transfer });
    fireEvent.dragOver(screen.getByTestId("agent-skill-s-secret"), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId("agent-skill-s-secret"), { dataTransfer: transfer });

    expect(setSkillsMutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["s-secret", "s-rubric"] });
  });

  it("shows type labels and only enables dragging globally enabled, linked skills", () => {
    agentSkillsResult = {
      isLoading: false, isError: false,
      data: [
        { agent_id: "ag1", skill_id: "s-rubric", order: 0 },
        { agent_id: "ag1", skill_id: "s-tests", order: 1 },
      ],
    };
    renderWithIntl();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getByTestId("agent-skill-s-rubric")).toHaveAttribute("draggable", "true");
    expect(screen.getByTestId("agent-skill-s-tests")).toHaveAttribute("draggable", "false");
  });

  it("shows the linked/total count", () => {
    agentSkillsResult = { isLoading: false, isError: false, data: [{ agent_id: "ag1", skill_id: "s-rubric", order: 0 }] };
    renderWithIntl();
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
  });
});
