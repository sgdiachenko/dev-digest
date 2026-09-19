"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../../lib/toast";
import { ApiError } from "../../../../../../../../lib/api";
import { SKILL_TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Config tab — name/description/type/body + enabled toggle + "what changed?". */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [note, setNote] = React.useState("");
  const [enabled, setEnabled] = React.useState(skill.enabled);

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setNote("");
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }));

  // The body is versioned only on a real change — the note is meaningless
  // (and dropped server-side) when nothing changed, so only send it then.
  const bodyChanged = body !== skill.body;

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: { name, description, type, body, enabled, ...(bodyChanged && note ? { note } : {}) },
      },
      {
        onSuccess: (data) => {
          toast.success(t("config.savedToast", { version: data.version }));
          setNote("");
        },
      },
    );

  // A duplicate name (409) gets a global toast like every other mutation error
  // (app-wide policy — see providers.tsx), PLUS this field-level hint so it's
  // obvious which input to fix without re-reading the toast.
  const nameConflict =
    update.isError && update.error instanceof ApiError && update.error.status === 409
      ? update.error.message
      : null;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={(value) => { if (!value || skill.safety?.safe !== false || body !== skill.body) setEnabled(value); }} size={16} />
        </label>
      </div>
      {skill.safety?.safe === false && <div role="alert" style={{ color: "var(--crit)", border: "1px solid var(--crit)", padding: 12, marginBottom: 16 }}>
        {t("safety.warning")}
        {skill.safety.reasons.map((reason) => <div key={reason}>• {reason}</div>)}
      </div>}
      <FormField label={t("config.name")} required hint={t("config.nameHint")}>
        <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} mono />
        {nameConflict && (
          <div role="alert" style={s.fieldError}>
            {t("config.duplicateName", { name })}
          </div>
        )}
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} placeholder={t("config.descriptionPlaceholder")} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} hint={t("config.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={12} mono />
      </FormField>
      <FormField label={t("config.note")} hint={t("config.noteHint")}>
        <TextInput value={note} onChange={setNote} placeholder={t("config.notePlaceholder")} />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
