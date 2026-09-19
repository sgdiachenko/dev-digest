"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import { SKILL_TYPES } from "../../constants";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("rubric");
  const [body, setBody] = React.useState("");
  const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name.trim());
  const canSubmit = validName && body.trim().length > 0 && !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    const skill = await create.mutateAsync({
      name: name.trim(), description: description.trim(), type, body: body.trim(), enabled: true,
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      title={t("create.title")}
      onClose={create.isPending ? undefined : onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose} disabled={create.isPending}>{t("create.cancel")}</Button>
          <Button kind="primary" onClick={() => void submit()} disabled={!canSubmit}>
            {create.isPending ? t("create.submitting") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 18, padding: 24 }}>
        <FormField label={t("create.name")} required hint={t("config.nameHint")}>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("create.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("create.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)}
            options={SKILL_TYPES.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }))} />
        </FormField>
        <FormField label={t("create.body")} required>
          <Textarea value={body} onChange={setBody} rows={12} mono />
        </FormField>
        {create.isError && <div role="alert" style={{ color: "var(--crit)" }}>
          {create.error instanceof ApiError && create.error.status === 409
            ? t("create.duplicateName") : create.error.message}
        </div>}
      </div>
    </Modal>
  );
}
