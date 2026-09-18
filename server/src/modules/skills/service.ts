import type {
  Skill,
  SkillDraft,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillWithStats,
} from '@devdigest/shared';
import type { SkillsRepository } from './repository.js';
import { SkillImportError, computeSkillStats, parseImport, toSkillDto, toSkillVersionDto } from './helpers.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * Skills service. Business logic for the Skills Lab (list/editor) + the agent
 * editor's Skills tab. A Skill = name + description ("the skill's interface",
 * written as a directive) + type + markdown body + enabled, versioned via
 * `skill_versions` on every body change.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  /**
   * Defaults to 'manual' (hand-written, trusted in the prompt). The import
   * flow's confirm step passes the SkillDraft's own source through here
   * (e.g. 'imported_url') so the skill keeps the trust level it was created
   * with — the run executor wraps anything but 'manual' in `<untrusted>`.
   */
  source?: SkillSource;
  /** Source files the body's rules were extracted from (Conventions Extractor). */
  evidenceFiles?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  note?: string | null;
  enabled?: boolean;
}

export class SkillsService {
  constructor(private readonly repo: SkillsRepository) {}

  async list(workspaceId: string): Promise<SkillWithStats[]> {
    const rows = await this.repo.listByWorkspace(workspaceId);
    if (rows.length === 0) return [];
    const statsById = await this.repo.statsRawForMany(workspaceId, rows.map((r) => r.id));
    return rows.map((row) => ({
      ...toSkillDto(row),
      stats: computeSkillStats(statsById.get(row.id) ?? { skillId: row.id, agents: [], findings: [], runs: [] }),
    }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const raw = await this.repo.statsRawFor(workspaceId, id);
    return computeSkillStats(raw);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled,
      ...(input.evidenceFiles ? { evidenceFiles: input.evidenceFiles } : {}),
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Version history for a skill, newest first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (route → 404).
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(workspaceId: string, skillId: string, version: number): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /** Restore a past body snapshot — appends a new version, never rewinds. */
  async restore(workspaceId: string, skillId: string, version: number): Promise<Skill | undefined> {
    const row = await this.repo.restore(workspaceId, skillId, version);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Parse an uploaded file (.md or .zip, base64-encoded) into a preview.
   * PARSE ONLY — nothing is persisted; the caller must POST /skills to save it.
   */
  importFromFile(filename: string, contentB64: string): SkillDraft {
    const bytes = Buffer.from(contentB64, 'base64');
    try {
      return parseImport(filename, bytes);
    } catch (err) {
      if (err instanceof SkillImportError) throw new ValidationError(err.message);
      throw err;
    }
  }
}
