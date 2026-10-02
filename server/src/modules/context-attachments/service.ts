/**
 * ContextAttachmentsService — pins Project Context catalog documents to agents and skills,
 * builds the views the editors show, and resolves the documents a run injects.
 *
 * Takes ports, not the container. Document text is only ever read through the catalog port
 * (git objects at the scanned sha) and never reaches a log: logs carry paths, sizes,
 * estimates and reasons.
 */
import { fitProjectContext, renderProjectContext } from '@devdigest/reviewer-core';
import type { ProjectDoc } from '@devdigest/reviewer-core';
import type {
  AgentContextView,
  AttachedDoc,
  AttachedDocStatus,
  ContextAttachmentsBody,
  ContextDoc,
  InheritedDoc,
  ProjectContextTrace,
  ProjectContextTraceDoc,
  SkillContextView,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { PROJECT_CONTEXT_BUDGET_TOKENS } from '../repo-intel/constants.js';
import { ContextUnavailableError } from '../project-context/types.js';
import type { ProjectContextCatalog, ResolvedDoc, ScanLogger } from '../project-context/types.js';
import { RESOLVE_TIMEOUT_MS } from './constants.js';
import { findDuplicates, orderRunCandidates, planInjection } from './helpers.js';
import type { PlanItem } from './helpers.js';
import type {
  AgentContextStore,
  DocRef,
  OrderedDocRef,
  ProjectContextForRun,
  ProjectContextForRepo,
  ProjectContextForRunInput,
  ProjectContextUnavailableReason,
  RepoContextResult,
  RunContextResult,
  SkillContextStore,
} from './types.js';

type CatalogIndex = Map<string, ContextDoc>;

/** Statuses whose text the catalog can hand to a run. */
const isReadable = (status: AttachedDocStatus): boolean => status === 'ok' || status === 'empty';

const unavailableReason = (err: unknown): ProjectContextUnavailableReason => {
  if (err instanceof ContextUnavailableError) return err.reason;
  if (err instanceof TimeoutError) return 'timeout';
  return 'error';
};

export class ContextAttachmentsService implements ProjectContextForRun, ProjectContextForRepo {
  constructor(
    private readonly agents: AgentContextStore,
    private readonly skills: SkillContextStore,
    private readonly catalog: ProjectContextCatalog,
  ) {}

  // ---- agent ----------------------------------------------------------------

  async getAgentView(
    workspaceId: string,
    agentId: string,
    repoId: string,
    logger?: ScanLogger,
  ): Promise<AgentContextView> {
    await this.requireAgent(workspaceId, agentId);
    const own = await this.agents.listContextDocs(agentId);
    const linked = await this.skills.linkedForAgentWithState(agentId);
    const skillDocs = await this.skills.listContextDocsForSkills(
      linked.map((s) => s.id),
      repoId,
    );
    const indexes = await this.loadCatalogs(workspaceId, [repoId, ...own.map((d) => d.repoId)]);

    const ownHere = own.filter((d) => d.repoId === repoId);
    const active = linked.filter((s) => s.enabled && s.safe);
    const docsOf = (skillId: string) => skillDocs.filter((d) => d.skillId === skillId);
    const candidates = orderRunCandidates(
      ownHere.map((d) => d.path),
      active.map((s) => ({ name: s.name, paths: docsOf(s.id).map((d) => d.path) })),
    );
    const index = indexes.get(repoId);
    const items: PlanItem[] = candidates.map((c) => {
      const doc = index?.get(c.path);
      return { estTokens: doc?.est_tokens ?? null, eligible: !c.duplicate && !!doc && isReadable(doc.status) };
    });
    const plan = planInjection(items, PROJECT_CONTEXT_BUDGET_TOKENS);

    let cursor = 0;
    const ownView = own.map((d): AttachedDoc => {
      const inRepo = d.repoId === repoId;
      const wouldSkip = inRepo ? plan.would_skip[cursor++] ?? null : null;
      return this.toAttached(d, indexes.get(d.repoId), wouldSkip);
    });
    const inherited: InheritedDoc[] = [];
    for (const skill of linked) {
      const isActive = skill.enabled && skill.safe;
      for (const d of docsOf(skill.id)) {
        const candidate = isActive ? candidates[cursor] : undefined;
        const wouldSkip = isActive ? plan.would_skip[cursor] ?? null : null;
        if (isActive) cursor++;
        inherited.push({
          ...this.toAttached(d, index, wouldSkip),
          skill_id: skill.id,
          skill_name: skill.name,
          skill_active: isActive,
          skill_inactive_reason: isActive ? null : !skill.enabled ? 'disabled' : 'unsafe',
          duplicate: candidate?.duplicate ?? false,
        });
      }
    }

    logger?.info(
      { agentId, repoId, own: own.length, inherited: inherited.length, total_est_tokens: plan.total },
      'context-attachments: agent view',
    );
    return {
      repo_id: repoId,
      budget_tokens: PROJECT_CONTEXT_BUDGET_TOKENS,
      total_est_tokens: plan.total,
      over_budget: plan.would_skip.some((w) => w !== null),
      own: ownView,
      inherited,
    };
  }

  async putAgent(
    workspaceId: string,
    agentId: string,
    repoId: string,
    body: ContextAttachmentsBody,
    logger?: ScanLogger,
  ): Promise<AgentContextView> {
    await this.requireAgent(workspaceId, agentId);
    const refs = toRefs(body);
    const saved = await this.agents.listContextDocs(agentId);
    await this.validateRefs(workspaceId, refs, saved);
    const { changed, version } = await this.agents.replaceContextDocs(workspaceId, agentId, refs);
    logger?.info({ agentId, count: refs.length, changed, version }, 'context-attachments: agent saved');
    return this.getAgentView(workspaceId, agentId, repoId, logger);
  }

  // ---- skill ----------------------------------------------------------------

  async getSkillView(
    workspaceId: string,
    skillId: string,
    repoId: string,
    logger?: ScanLogger,
  ): Promise<SkillContextView> {
    await this.requireSkill(workspaceId, skillId);
    const own = await this.skills.listContextDocs(skillId);
    const indexes = await this.loadCatalogs(workspaceId, [repoId, ...own.map((d) => d.repoId)]);
    const index = indexes.get(repoId);

    const ownHere = own.filter((d) => d.repoId === repoId);
    const plan = planInjection(
      ownHere.map((d) => {
        const doc = index?.get(d.path);
        return { estTokens: doc?.est_tokens ?? null, eligible: !!doc && isReadable(doc.status) };
      }),
      PROJECT_CONTEXT_BUDGET_TOKENS,
    );
    let cursor = 0;
    const ownView = own.map((d): AttachedDoc => {
      const wouldSkip = d.repoId === repoId ? plan.would_skip[cursor++] ?? null : null;
      return this.toAttached(d, indexes.get(d.repoId), wouldSkip);
    });

    const { serialized, tokens } = await this.serialize(workspaceId, repoId, ownHere, logger);
    logger?.info(
      { skillId, repoId, own: own.length, total_est_tokens: plan.total, serialized_est_tokens: tokens },
      'context-attachments: skill view',
    );
    return {
      repo_id: repoId,
      budget_tokens: PROJECT_CONTEXT_BUDGET_TOKENS,
      total_est_tokens: plan.total,
      over_budget: plan.would_skip.some((w) => w !== null),
      own: ownView,
      serialized,
      serialized_est_tokens: tokens,
    };
  }

  async putSkill(
    workspaceId: string,
    skillId: string,
    repoId: string,
    body: ContextAttachmentsBody,
    logger?: ScanLogger,
  ): Promise<SkillContextView> {
    await this.requireSkill(workspaceId, skillId);
    const refs = toRefs(body);
    const saved = await this.skills.listContextDocs(skillId);
    await this.validateRefs(workspaceId, refs, saved);
    await this.skills.replaceContextDocs(workspaceId, skillId, refs);
    logger?.info({ skillId, count: refs.length }, 'context-attachments: skill saved');
    return this.getSkillView(workspaceId, skillId, repoId, logger);
  }

  // ---- run ------------------------------------------------------------------

  async resolveForRun(input: ProjectContextForRunInput, logger?: ScanLogger): Promise<RunContextResult> {
    try {
      return await withTimeout(this.resolveUnbounded(input, logger), RESOLVE_TIMEOUT_MS);
    } catch (err) {
      const reason = unavailableReason(err);
      logger?.warn({ agentId: input.agentId, repoId: input.repoId, reason }, 'project context unavailable');
      return { kind: 'unavailable', reason };
    }
  }

  private async resolveUnbounded(
    input: ProjectContextForRunInput,
    logger?: ScanLogger,
  ): Promise<RunContextResult> {
    const { workspaceId, agentId, repoId, injectedSkills } = input;
    const own = (await this.agents.listContextDocs(agentId)).filter((d) => d.repoId === repoId);
    // Only skills injected into THIS run's prompt contribute (AC-20); rows of anything else
    // (disabled, unlinked, unsafe) are never read.
    const skillDocs = await this.skills.listContextDocsForSkills(
      injectedSkills.map((s) => s.id),
      repoId,
    );
    const candidates = orderRunCandidates(
      own.map((d) => d.path),
      injectedSkills.map((s) => ({
        name: s.name,
        paths: skillDocs.filter((d) => d.skillId === s.id).map((d) => d.path),
      })),
    );
    if (candidates.length === 0) return { kind: 'none' };

    const paths = [...new Set(candidates.map((c) => c.path))];
    const resolved = await this.catalog.resolveDocs(workspaceId, repoId, paths);
    const byPath = new Map(resolved.docs.map((d) => [d.path, d]));

    const plan = planInjection(
      candidates.map((c) => {
        const doc = byPath.get(c.path);
        return { estTokens: doc?.estTokens ?? null, eligible: !c.duplicate && !!doc && isReadable(doc.status) };
      }),
      PROJECT_CONTEXT_BUDGET_TOKENS,
    );

    const docs: ProjectDoc[] = [];
    const secretPaths: string[] = [];
    const traceDocs: ProjectContextTraceDoc[] = [];
    let readable = 0;
    candidates.forEach((c, i) => {
      const doc = byPath.get(c.path);
      const base = { path: c.path, source: c.source, skill_name: c.skillName, est_tokens: doc?.estTokens ?? null };
      if (c.duplicate) {
        traceDocs.push({ ...base, status: 'skipped', reason: 'duplicate' });
        return;
      }
      if (!doc || !isReadable(doc.status)) {
        traceDocs.push({ ...base, status: 'skipped', reason: skipReasonOf(doc) });
        return;
      }
      readable++;
      if (plan.would_skip[i]) {
        traceDocs.push({ ...base, status: 'skipped', reason: 'over_budget' });
        return;
      }
      docs.push({ path: c.path, text: doc.text ?? '' });
      if (doc.secretWarning) secretPaths.push(c.path);
      traceDocs.push({ ...base, status: 'injected', reason: null });
    });

    const trace: ProjectContextTrace = {
      sha: resolved.sha,
      budget_tokens: PROJECT_CONTEXT_BUDGET_TOKENS,
      total_est_tokens: plan.total,
      docs: traceDocs,
    };
    logger?.info(
      {
        agentId,
        repoId,
        sha: resolved.sha,
        injected: docs.length,
        skipped: traceDocs.length - docs.length,
        total_est_tokens: plan.total,
      },
      'project context resolved',
    );
    return { kind: 'resolved', sha: resolved.sha, docs, trace, secretPaths, allReadsFailed: readable === 0 };
  }

  /**
   * Every readable document attached to any enabled agent (or its active skills) for this repo,
   * with no budget. `resolveDocs` is always called — even with no candidates — because it checks
   * the clone and the catalog first, so the reported reason is the root cause:
   * `no_clone` > `no_catalog` > `none`.
   */
  async resolveForRepo(workspaceId: string, repoId: string, logger?: ScanLogger): Promise<RepoContextResult> {
    try {
      return await withTimeout(this.resolveRepoUnbounded(workspaceId, repoId, logger), RESOLVE_TIMEOUT_MS);
    } catch (err) {
      const reason = unavailableReason(err);
      logger?.warn({ repoId, reason }, 'repo project context unavailable');
      return { kind: 'unavailable', reason };
    }
  }

  private async resolveRepoUnbounded(
    workspaceId: string,
    repoId: string,
    logger?: ScanLogger,
  ): Promise<RepoContextResult> {
    const paths: string[] = [];
    const seen = new Set<string>();
    const add = (path: string): void => {
      if (!seen.has(path)) {
        seen.add(path);
        paths.push(path);
      }
    };
    for (const { id: agentId } of await this.agents.listEnabledIdsOrdered(workspaceId)) {
      for (const d of await this.agents.listContextDocs(agentId)) if (d.repoId === repoId) add(d.path);
      const active = (await this.skills.linkedForAgentWithState(agentId))
        .filter((s) => s.enabled && s.safe)
        .sort((a, b) => a.order - b.order);
      if (active.length === 0) continue;
      const skillDocs = await this.skills.listContextDocsForSkills(
        active.map((s) => s.id),
        repoId,
      );
      for (const skill of active) {
        skillDocs
          .filter((d) => d.skillId === skill.id)
          .sort((a, b) => a.position - b.position)
          .forEach((d) => add(d.path));
      }
    }

    const resolved = await this.catalog.resolveDocs(workspaceId, repoId, paths);
    if (paths.length === 0) return { kind: 'none' };
    // Unlike a review run (which records `secretPaths`), the brief sends nothing flagged as a secret.
    const docs = resolved.docs
      .filter((d) => isReadable(d.status) && !d.secretWarning)
      .map((d) => ({ path: d.path, text: d.text ?? '', estTokens: d.estTokens }));
    logger?.info({ repoId, sha: resolved.sha, candidates: paths.length, readable: docs.length }, 'repo project context resolved');
    return { kind: 'resolved', sha: resolved.sha, docs };
  }

  // ---- internals ------------------------------------------------------------

  private async requireAgent(workspaceId: string, agentId: string): Promise<void> {
    if (!(await this.agents.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
  }

  private async requireSkill(workspaceId: string, skillId: string): Promise<void> {
    if (!(await this.skills.getById(workspaceId, skillId))) throw new NotFoundError('Skill not found');
  }

  /** One `getCatalog` per distinct repo. A repo that is not in the workspace is an empty index. */
  private async loadCatalogs(workspaceId: string, repoIds: string[]): Promise<Map<string, CatalogIndex>> {
    const unique = [...new Set(repoIds)];
    const entries = await Promise.all(
      unique.map(async (id): Promise<[string, CatalogIndex]> => {
        try {
          const catalog = await this.catalog.getCatalog(workspaceId, id);
          return [id, new Map(catalog.files.map((f) => [f.path, f]))];
        } catch (err) {
          if (err instanceof NotFoundError) return [id, new Map()];
          throw err;
        }
      }),
    );
    return new Map(entries);
  }

  /**
   * AC-8: no duplicates, every repo inside the workspace, and every NEWLY added pair present in
   * the catalog (D1: an already-saved pair that left the catalog may stay and be re-ordered).
   * Runs BEFORE any write — a duplicate would otherwise hit the primary key (500).
   */
  private async validateRefs(workspaceId: string, refs: DocRef[], saved: DocRef[]): Promise<void> {
    const dupes = findDuplicates(refs);
    if (dupes.length > 0) {
      throw new ValidationError('Duplicate attachments', {
        duplicates: dupes.map((d) => ({ repo_id: d.repoId, path: d.path })),
      });
    }
    const indexes = new Map<string, CatalogIndex>();
    for (const repoId of new Set(refs.map((r) => r.repoId))) {
      try {
        const catalog = await this.catalog.getCatalog(workspaceId, repoId);
        indexes.set(repoId, new Map(catalog.files.map((f) => [f.path, f])));
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new ValidationError('Repository not found', { repo_id: repoId });
        }
        throw err;
      }
    }
    const savedKeys = new Set(saved.map(keyOf));
    const unknown = refs.filter((r) => !savedKeys.has(keyOf(r)) && !indexes.get(r.repoId)?.has(r.path));
    if (unknown.length > 0) {
      throw new ValidationError('Document not in the catalog', {
        missing: unknown.map((d) => ({ repo_id: d.repoId, path: d.path })),
      });
    }
  }

  private toAttached(ref: OrderedDocRef, index: CatalogIndex | undefined, wouldSkip: 'over_budget' | null): AttachedDoc {
    const doc = index?.get(ref.path);
    return {
      repo_id: ref.repoId,
      path: ref.path,
      position: ref.position,
      category: doc?.category ?? null,
      est_tokens: doc?.est_tokens ?? null,
      status: doc ? doc.status : 'missing',
      would_skip: wouldSkip,
    };
  }

  /** The block exactly as a run would inject it for these documents; never throws. */
  private async serialize(
    workspaceId: string,
    repoId: string,
    refs: OrderedDocRef[],
    logger?: ScanLogger,
  ): Promise<{ serialized: string; tokens: number }> {
    if (refs.length === 0) return { serialized: '', tokens: 0 };
    let resolved;
    try {
      resolved = await withTimeout(
        this.catalog.resolveDocs(workspaceId, repoId, refs.map((r) => r.path)),
        RESOLVE_TIMEOUT_MS,
      );
    } catch (err) {
      logger?.warn({ repoId, reason: unavailableReason(err) }, 'skill serialization unavailable');
      return { serialized: '', tokens: 0 };
    }
    const readable = resolved.docs.filter((d) => isReadable(d.status));
    const plan = planInjection(
      readable.map((d) => ({ estTokens: d.estTokens })),
      PROJECT_CONTEXT_BUDGET_TOKENS,
    );
    const fitting = readable.filter((_, i) => plan.would_skip[i] === null);
    const { kept } = fitProjectContext(fitting.map((d) => ({ path: d.path, text: d.text ?? '' })));
    const tokens = kept.reduce((sum, k) => sum + (fitting.find((d) => d.path === k.path)?.estTokens ?? 0), 0);
    return { serialized: renderProjectContext(kept), tokens };
  }
}

const keyOf = (r: DocRef): string => `${r.repoId}\u0000${r.path}`;

const toRefs = (body: ContextAttachmentsBody): DocRef[] =>
  body.docs.map((d) => ({ repoId: d.repo_id, path: d.path }));

/** The trace reason for a candidate the catalog could not hand over. */
function skipReasonOf(doc: ResolvedDoc | undefined): 'missing' | 'too_large' | 'unreadable' {
  if (doc?.status === 'too_large' || doc?.status === 'unreadable') return doc.status;
  return 'missing';
}
