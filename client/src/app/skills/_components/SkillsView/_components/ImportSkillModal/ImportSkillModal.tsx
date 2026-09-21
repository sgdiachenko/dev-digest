/* ImportSkillModal — file-only import (.md / .zip). Parse → preview (incl. the
   list of archive entries that were NEVER read/executed) → Confirm & save.
   Nothing is persisted before the confirm click. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { SkillDraft } from "@devdigest/shared";
import { SKILL_NAME_RE } from "@devdigest/shared/contracts/knowledge";
import { useCreateSkill, useImportSkillFile } from "../../../../../../lib/hooks/skills";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onCreate, onUrl }: { onClose: () => void; onCreate?: () => void; onUrl?: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const importFile = useImportSkillFile();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  const [name, setName] = React.useState("");
  const [nameEdited, setNameEdited] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const validName = SKILL_NAME_RE.test(name.trim());

  const onPick = async (file: File) => {
    setError(null);
    setDraft(null);
    try {
      const content_b64 = await readFileAsBase64(file);
      const result = await importFile.mutateAsync({ filename: file.name, content_b64 });
      setDraft(result);
      if (!nameEdited) setName(result.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("import.parseError"));
    } finally {
      // Allow re-picking the same file after a failed/retried import.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirm = async () => {
    if (!draft || !validName) return;
    // Imported skills land disabled until someone reads the body and vets it
    // (the rail's "needs vetting" badge); a manual create is enabled by default.
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: draft.description,
      type: draft.type,
      body: draft.body,
      source: draft.source,
      enabled: draft.source === "manual",
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      title={t("create.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={confirm} disabled={!draft || !validName || create.isPending}>
            {create.isPending ? t("import.confirming") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {onCreate && (
          <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            <Button kind="ghost" size="sm" onClick={onCreate}>{t("create.tabCreate")}</Button>
            <Button kind="primary" size="sm" disabled>{t("create.tabFile")}</Button>
            {onUrl && <Button kind="ghost" size="sm" onClick={onUrl}>{t("create.tabUrl")}</Button>}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".md,.zip"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
          }}
        />
        <FormField label={t("import.nameLabel")} required hint={t("config.nameHint")}>
          <TextInput aria-label={t("import.nameLabel")} value={name} onChange={(value) => { setName(value); setNameEdited(true); }} placeholder="pr-quality-rubric" mono />
        </FormField>
        <Button
          kind="secondary"
          icon="Upload"
          onClick={() => inputRef.current?.click()}
          loading={importFile.isPending}
        >
          {importFile.isPending ? t("import.parsing") : t("import.chooseFile")}
        </Button>

        {error && <div role="alert" style={s.error}>{error}</div>}

        {draft && (
          <div style={s.preview}>
            <div style={s.previewHead}>
              <span style={s.previewTitle}>{t("import.previewTitle")}</span>
              <Badge color="var(--text-secondary)">{t(`listItem.type.${draft.type}`)}</Badge>
              <Badge color="var(--text-muted)" mono>
                {name || draft.name}
              </Badge>
            </div>
            <p style={s.description}>{draft.description}</p>
            <pre className="mono" style={s.bodyPreview}>
              {draft.body}
            </pre>
            {draft.skipped_files.length > 0 && (
              <div style={s.skipped}>
                <div style={s.skippedTitle}>{t("import.skippedTitle")}</div>
                <ul style={s.skippedList}>
                  {draft.skipped_files.map((f) => (
                    <li key={f} className="mono">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p style={s.note}>{t("import.sourceNote")}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
