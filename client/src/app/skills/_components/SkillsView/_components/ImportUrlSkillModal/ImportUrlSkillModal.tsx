"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { SkillDraft } from "@devdigest/shared";
import { useCreateSkill, useImportSkillUrl } from "../../../../../../lib/hooks/skills";

export function ImportUrlSkillModal({ onClose, onCreate, onFile }: { onClose: () => void; onCreate: () => void; onFile: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const importer = useImportSkillUrl();
  const create = useCreateSkill();
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  const [error, setError] = React.useState("");
  const validName = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(name.trim());

  const preview = async () => {
    setError("");
    setDraft(null);
    try {
      const result = await importer.mutateAsync(url);
      setDraft(result);
      setName(result.name);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const save = async () => {
    if (!draft || !validName) return;
    try {
      const skill = await create.mutateAsync({
        name: name.trim(), description: draft.description, type: draft.type,
        body: draft.body, source: "imported_url", enabled: false,
      });
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return <Modal title={t("create.title")} onClose={onClose} footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
    <Button kind="ghost" onClick={onClose}>{t("import.cancel")}</Button>
    <Button kind="primary" onClick={() => void save()} disabled={!draft || !validName || create.isPending}>
      {create.isPending ? t("urlImport.saving") : t("urlImport.save")}
    </Button>
  </div>}>
    <div style={{ padding: 24, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        <Button kind="ghost" size="sm" onClick={onCreate}>{t("create.tabCreate")}</Button>
        <Button kind="ghost" size="sm" onClick={onFile}>{t("create.tabFile")}</Button>
        <Button kind="primary" size="sm" disabled>{t("create.tabUrl")}</Button>
      </div>
      <FormField label={t("urlImport.url")} required>
        <TextInput value={url} onChange={(value) => { setUrl(value); setDraft(null); }} placeholder="https://raw.githubusercontent.com/org/repo/main/SKILL.md" />
      </FormField>
      <Button kind="secondary" onClick={() => void preview()} disabled={!url.startsWith("https://") || importer.isPending}>
        {importer.isPending ? t("urlImport.fetching") : t("urlImport.fetch")}
      </Button>
      {draft && <>
        <FormField label={t("urlImport.name")} required><TextInput value={name} onChange={setName} mono /></FormField>
        <div role={draft.safety?.safe === false ? "alert" : "status"} style={{ color: draft.safety?.safe === false ? "var(--crit)" : "var(--warn)" }}>
          {t(draft.safety?.safe === false ? "urlImport.unsafe" : "urlImport.safe")}
          {draft.safety?.reasons.map((reason) => <div key={reason}>• {reason}</div>)}
        </div>
        <pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", border: "1px solid var(--border)", padding: 12 }}>{draft.body}</pre>
      </>}
      {error && <div role="alert" style={{ color: "var(--crit)" }}>{error}</div>}
    </div>
  </Modal>;
}
