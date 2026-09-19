import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// readFileAsBase64 touches FileReader — stub it so the test drives the
// mutation directly instead of exercising real file-reading.
vi.mock("./helpers", () => ({ readFileAsBase64: vi.fn().mockResolvedValue("base64") }));

const importMutateAsync = vi.fn();
const createMutateAsync = vi.fn();
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillFile: () => ({ mutateAsync: importMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(onClose: () => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportSkillModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

function pickFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["# my-rule\nBody."], "rule.md", { type: "text/markdown" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportSkillModal (smoke)", () => {
  it("shows the parsed preview, including skipped files, and confirm is disabled until then", async () => {
    importMutateAsync.mockResolvedValue({
      name: "my-rule",
      description: "Body.",
      type: "custom",
      body: "Body.",
      source: "imported_url",
      skipped_files: ["scripts/run.sh"],
    });

    renderWithIntl(vi.fn());

    // Nothing parsed yet — Confirm is disabled and there's no preview.
    expect(screen.getByText("Confirm & save").closest("button")).toBeDisabled();

    pickFile();

    await waitFor(() => expect(importMutateAsync).toHaveBeenCalledWith({ filename: "rule.md", content_b64: "base64" }));
    await screen.findByText("my-rule");
    expect(screen.getByText("scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText("Confirm & save").closest("button")).not.toBeDisabled();
    // Nothing was persisted by parsing alone.
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("confirm persists the draft's OWN source (imported_url) and lands disabled until vetted", async () => {
    importMutateAsync.mockResolvedValue({
      name: "my-rule",
      description: "Body.",
      type: "custom",
      body: "Body.",
      source: "imported_url",
      skipped_files: [],
    });
    createMutateAsync.mockResolvedValue({ id: "sk-new" });
    const onClose = vi.fn();

    renderWithIntl(onClose);
    pickFile();
    await screen.findByText("my-rule");

    fireEvent.click(screen.getByText("Confirm & save"));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "my-rule", source: "imported_url", enabled: false }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/skills/sk-new?tab=config");
  });

  it("uses the name entered before file selection instead of the parsed name", async () => {
    importMutateAsync.mockResolvedValue({
      name: "parsed-name", description: "Body.", type: "custom", body: "Body.",
      source: "imported_url", skipped_files: [],
    });
    createMutateAsync.mockResolvedValue({ id: "sk-new" });
    renderWithIntl(vi.fn());

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "my-custom-name" } });
    pickFile();
    await screen.findByText("my-custom-name");
    fireEvent.click(screen.getByText("Confirm & save"));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "my-custom-name" }),
    ));
  });

  it("shows a parse error inline and never calls create", async () => {
    importMutateAsync.mockRejectedValue(new Error("bundle.zip contains no markdown file"));
    renderWithIntl(vi.fn());

    pickFile();

    await screen.findByText("bundle.zip contains no markdown file");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
