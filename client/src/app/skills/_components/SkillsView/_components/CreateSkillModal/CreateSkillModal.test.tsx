import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";

const createSkill = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createSkill, isPending: false, isError: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("CreateSkillModal", () => {
  it("does not persist until a valid form is submitted, then opens the new skill", async () => {
    createSkill.mockResolvedValue({ id: "sk-new" });
    const close = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <CreateSkillModal onClose={close} />
      </NextIntlClientProvider>,
    );
    expect(createSkill).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    const [name, description, body] = screen.getAllByRole("textbox");
    fireEvent.change(name!, { target: { value: "api-contract" } });
    fireEvent.change(description!, { target: { value: "Review API" } });
    fireEvent.change(body!, { target: { value: "# Rule\nDo this." } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(createSkill).toHaveBeenCalledWith({
      name: "api-contract", description: "Review API", type: "rubric", body: "# Rule\nDo this.", enabled: true,
    }));
    expect(close).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk-new?tab=config");
  });
});
