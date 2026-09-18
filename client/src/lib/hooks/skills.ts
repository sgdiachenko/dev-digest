/* hooks/skills.ts — React Query hooks for the L02 Skills feature (Skills Lab +
   the agent editor's Skills tab). One cache entry per skill (`["skill", id]`)
   plus the rail list (`["skills"]`, carrying batched Stats-tab counters) so a
   toggle flipped on the rail and one flipped in Config stay in sync. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Skill,
  SkillDraft,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillWithStats,
} from "@devdigest/shared";

export const skillKeys = {
  list: () => ["skills"] as const,
  one: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill-versions", id] as const,
  version: (id: string | null | undefined, v: number | null) => ["skill-version", id, v] as const,
  stats: (id: string | null | undefined) => ["skill-stats", id] as const,
};

/** Rail list. Carries batched per-skill stats — never one request per card. */
export function useSkills() {
  return useQuery({
    queryKey: skillKeys.list(),
    queryFn: () => api.get<SkillWithStats[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.one(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  /** Defaults to 'manual' server-side. The import confirm step passes the
   *  SkillDraft's own source through so trust-per-source carries into the
   *  prompt (see server's ReviewRunExecutor.buildSkillBlocks). */
  source?: Skill["source"];
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.setQueryData(skillKeys.one(data.id), data);
      qc.invalidateQueries({ queryKey: skillKeys.list() });
    },
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & {
    /** "What changed?" — only recorded when `body` actually changes. */
    note?: string;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      // Write the detail entry AND patch the row inside the rail list, so a
      // toggle flipped in either place is visible in the other before the
      // refetch lands. Stats on the row are preserved — the PUT doesn't return them.
      qc.setQueryData(skillKeys.one(data.id), data);
      qc.setQueryData<SkillWithStats[]>(skillKeys.list(), (rows) =>
        rows?.map((r) => (r.id === data.id ? { ...r, ...data } : r)),
      );
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
      qc.invalidateQueries({ queryKey: skillKeys.stats(data.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: skillKeys.one(id) });
      qc.invalidateQueries({ queryKey: skillKeys.list() });
    },
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.stats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Body-snapshot history, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** One archived snapshot — backs the Diff modal's "before" side. */
export function useSkillVersion(id: string | null | undefined, version: number | null) {
  return useQuery({
    queryKey: skillKeys.version(id, version),
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/restore`, { version }),
    onSuccess: (data) => {
      qc.setQueryData(skillKeys.one(data.id), data);
      qc.invalidateQueries({ queryKey: skillKeys.list() });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
    },
  });
}

/**
 * Parse-only import (.md or .zip, base64-encoded). Returns a preview —
 * NOTHING is persisted until the caller confirms and calls `useCreateSkill`.
 */
export function useImportSkillFile() {
  return useMutation({
    mutationFn: (input: { filename: string; content_b64: string }) =>
      api.post<SkillDraft>("/skills/import", input),
  });
}
