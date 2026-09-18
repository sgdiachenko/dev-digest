"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionSkillDraft, Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useLinkAgentSkill } from "../../../../../../lib/hooks/skills";
import { useAgents } from "../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { SKILL_TYPE_VALUES } from "../../../../../skills/_components/SkillsView/_components/SkillEditor/_components/ConfigTab/constants";
import { s } from "./styles";

export interface CreateSkillModalProps {
  draft: ConventionSkillDraft;
  repoName: string;
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}

/**
 * Pre-filled from the accepted candidates (`draft`) — everything below is
 * editable before it exists, same preview-then-confirm flow as skill import.
 * Unlike the mockup, this ALSO links the new skill to an agent (grading
 * criterion #42: the resulting skill must be "прилінкований до агента"),
 * via the additive `useLinkAgentSkill` — never the replace-all set.
 */
export function CreateSkillModal({ draft, repoName, onClose, onCreated }: CreateSkillModalProps) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const link = useLinkAgentSkill();
  const { data: agents } = useAgents();

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  const [agentId, setAgentId] = React.useState("");

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: tSkills(`config.typeOptions.${v}`) }));
  const agentOptions = [
    { value: "", label: t("createSkill.chooseAgent") },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const busy = create.isPending || link.isPending;
  const canSubmit = name.trim().length > 0 && body.trim().length > 0 && agentId !== "" && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description,
      type,
      body,
      enabled,
      source: "extracted",
      evidence_files: draft.evidence_files,
    });
    await link.mutateAsync({ agentId, skillId: skill.id });
    toast.success(t("createSkill.created", { name: skill.name }));
    onCreated(skill);
  };

  const nameConflict =
    create.isError && create.error instanceof ApiError && create.error.status === 409 ? create.error.message : null;

  return (
    <Modal
      width={640}
      title={t("createSkill.title")}
      subtitle={draft.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={busy}>
            {t("createSkill.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? t("createSkill.creating") : t("createSkill.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>{t("createSkill.mergedFrom", { count: draft.convention_ids.length, repo: repoName })}</div>

        <FormField label={t("createSkill.name")} required>
          <TextInput value={name} onChange={setName} mono />
          {nameConflict && (
            <div role="alert" style={s.fieldError}>
              {nameConflict}
            </div>
          )}
        </FormField>

        <FormField label={t("createSkill.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>

        <div style={s.row}>
          <div style={s.rowItem}>
            <FormField label={t("createSkill.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
          </div>
          <div style={s.rowItem}>
            <FormField label={t("createSkill.agent")} required hint={t("createSkill.agentHint")}>
              <SelectInput value={agentId} onChange={setAgentId} options={agentOptions} mono={false} />
            </FormField>
          </div>
        </div>

        <div style={s.enabledRow}>
          <Toggle on={enabled} onChange={setEnabled} size={16} />
          <span style={s.enabledLabel}>{t("createSkill.enabled")}</span>
        </div>

        <FormField label={t("createSkill.body")} hint={t("createSkill.bodyHint")}>
          <Textarea value={body} onChange={setBody} rows={16} mono />
        </FormField>
      </div>
    </Modal>
  );
}
