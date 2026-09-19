import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";

const push = vi.fn();
const importMutateAsync = vi.fn();
const createMutateAsync = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillUrl: () => ({ mutateAsync: importMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { ImportUrlSkillModal } from "./ImportUrlSkillModal";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ImportUrlSkillModal", () => {
  it("keeps a custom name entered before preview and saves the imported skill disabled", async () => {
    importMutateAsync.mockResolvedValue({
      name: "parsed-name", description: "Body.", type: "custom", body: "# Body",
      source: "imported_url", skipped_files: [], safety: { safe: true, reasons: [] },
    });
    createMutateAsync.mockResolvedValue({ id: "sk-new" });
    render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportUrlSkillModal onClose={vi.fn()} onCreate={vi.fn()} onFile={vi.fn()} />
    </NextIntlClientProvider>);

    const name = screen.getByRole("textbox", { name: "Skill name" });
    fireEvent.change(name, { target: { value: "my-custom-name" } });
    fireEvent.change(screen.getByPlaceholderText("https://raw.githubusercontent.com/org/repo/main/SKILL.md"), {
      target: { value: "https://example.com/SKILL.md" },
    });
    fireEvent.click(screen.getByText("Preview URL"));
    await waitFor(() => expect(importMutateAsync).toHaveBeenCalledWith("https://example.com/SKILL.md"));
    expect(name).toHaveValue("my-custom-name");
    fireEvent.click(screen.getByText("Import skill"));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      name: "my-custom-name", source: "imported_url", enabled: false,
    })));
  });
});
