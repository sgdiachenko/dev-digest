import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ConventionSkillDraft } from "@devdigest/shared";
import conventionsMessages from "../../../../../../../messages/en/conventions.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const createMutateAsync = vi.fn();
const linkMutateAsync = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false, isError: false, error: undefined }),
  useLinkAgentSkill: () => ({ mutateAsync: linkMutateAsync, isPending: false }),
}));

const AGENTS: Agent[] = [
  {
    id: "ag1",
    name: "API Contract Reviewer",
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "x",
    output_schema: null,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    enabled: true,
    version: 1,
  },
];
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: AGENTS }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  createMutateAsync.mockReset();
  linkMutateAsync.mockReset();
});

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "2 house conventions extracted from acme/payments-api",
  type: "convention",
  body: "# repo-conventions\n\n## rule-one\nAlways do X.",
  evidence_files: ["src/api/users.ts"],
  convention_ids: ["c1", "c2"],
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages, skills: skillsMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillModal", () => {
  it("pre-fills name/description/body from the draft and explains the source", () => {
    const { container } = renderWithProviders(
      <CreateSkillModal draft={DRAFT} repoName="acme/payments-api" onClose={() => {}} onCreated={() => {}} />,
    );
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    expect(container.querySelector("textarea")).toHaveValue(DRAFT.body);
    expect(screen.getByText(/Merged from 2 accepted conventions in acme\/payments-api/)).toBeInTheDocument();
  });

  it("disables Create until an agent is chosen (grading #42: the skill must be linked to an agent)", () => {
    renderWithProviders(<CreateSkillModal draft={DRAFT} repoName="acme/payments-api" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("creates the skill with evidence_files, then links it to the chosen agent, then calls onCreated", async () => {
    createMutateAsync.mockResolvedValue({ id: "sk1", name: "repo-conventions" });
    linkMutateAsync.mockResolvedValue([]);
    const onCreated = vi.fn();

    renderWithProviders(<CreateSkillModal draft={DRAFT} repoName="acme/payments-api" onClose={() => {}} onCreated={onCreated} />);

    // FormField's <label> isn't programmatically associated with its input
    // (no htmlFor/id), so address the two <select>s by DOM order: Type, then
    // Link-to-agent.
    const [, agentSelect] = screen.getAllByRole("combobox");
    fireEvent.change(agentSelect!, { target: { value: "ag1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "repo-conventions",
        type: "convention",
        source: "extracted",
        evidence_files: ["src/api/users.ts"],
      }),
    );
    await waitFor(() => expect(linkMutateAsync).toHaveBeenCalledWith({ agentId: "ag1", skillId: "sk1" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "sk1", name: "repo-conventions" }));
  });

  it("Cancel closes without creating anything", () => {
    const onClose = vi.fn();
    renderWithProviders(<CreateSkillModal draft={DRAFT} repoName="acme/payments-api" onClose={onClose} onCreated={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
