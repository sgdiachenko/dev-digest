import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitHubCiClient,
  RunnerBundleSource,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient, OctokitGitHubCiClient } from '../adapters/github/octokit.js';
import { FsRunnerBundleSource } from '../adapters/runner-bundle/fs.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { AppError, ConfigError } from './errors.js';
import { wrapUntrusted } from './prompt.js';
import { loadPromptTemplate } from './prompts.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { RepoRepository } from '../modules/repos/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { ReviewService } from '../modules/reviews/service.js';
import { ReviewRunExecutor } from '../modules/reviews/run-executor.js';
import { IntentRepository } from '../modules/intent/repository.js';
import { IntentService } from '../modules/intent/service.js';
import { PullsRepository } from '../modules/pulls/repository.js';
import { SmartDiffService } from '../modules/smart-diff/service.js';
import { BlastService } from '../modules/blast/service.js';
import { BriefRepository } from '../modules/brief/repository.js';
import { BriefService } from '../modules/brief/service.js';
import { PrHistoryService } from '../modules/pr-history/service.js';
import { ProjectContextRepository } from '../modules/project-context/repository.js';
import { ProjectContextService } from '../modules/project-context/service.js';
import { EvalRepository } from '../modules/eval/repository.js';
import { EvalService } from '../modules/eval/service.js';
import { EvalAttemptService } from '../modules/eval/attempt-service.js';
import { EvalSuiteRunService } from '../modules/eval/suite-run-service.js';
import type { EvalAgentReader, EvalLogger, EvalSkillsReader } from '../modules/eval/types.js';
import { OnboardingRepository } from '../modules/onboarding/repository.js';
import { OnboardingService } from '../modules/onboarding/service.js';
import { OnboardingNarrativeService } from '../modules/onboarding/narrative-service.js';
import { CiRepository } from '../modules/ci/repository.js';
import { CiService } from '../modules/ci/service.js';
import { CiSyncService } from '../modules/ci/sync-service.js';
import type { CiAgentReader, CiGitHub, CiStore } from '../modules/ci/types.js';
import { ContextAttachmentsService } from '../modules/context-attachments/service.js';
import { resolveFeatureModel } from '../modules/settings/feature-models.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  /** Read side of Export to CI; tests inject a mock (defaults to Octokit over the same token). */
  githubCi?: GitHubCiClient;
  /** Prebuilt agent-runner files; tests inject a mock (defaults to `config.runnerDir`). */
  runnerBundle?: RunnerBundleSource;
  /** Export-to-CI persistence port / agent reader; DB-free tests inject fakes. */
  ciStore?: CiStore;
  ciAgents?: CiAgentReader;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _githubCi?: GitHubCiClient;
  private _ciRepo?: CiRepository;
  private _ciService?: CiService;
  private _ciSyncService?: CiSyncService;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _skillsRepo?: SkillsRepository;
  private _reposRepo?: RepoRepository;
  private _reviewRepo?: ReviewRepository;
  private _intentRepo?: IntentRepository;
  private _intentService?: IntentService;
  private _pullsRepo?: PullsRepository;
  private _smartDiffService?: SmartDiffService;
  private _blastService?: BlastService;
  private _briefRepo?: BriefRepository;
  private _briefService?: BriefService;
  private _prHistoryService?: PrHistoryService;
  private _projectContext?: ProjectContextService;
  private _contextAttachments?: ContextAttachmentsService;
  private _evalRepo?: EvalRepository;
  private _evalService?: EvalService;
  private _evalAttemptService?: EvalAttemptService;
  private _evalSuiteRunService?: EvalSuiteRunService;
  private _onboarding?: OnboardingService;
  private _onboardingNarrative?: OnboardingNarrativeService;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  get reposRepo(): RepoRepository {
    return (this._reposRepo ??= new RepoRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get intentRepo(): IntentRepository {
    return (this._intentRepo ??= new IntentRepository(this.db));
  }

  /**
   * The Intent Layer use case, wired from its ports. `resolveFeatureModel`
   * (and `new IntentService`/`new IntentRepository`) are only ever called
   * here, in the composition root — never from `modules/intent/routes.ts`.
   *
   * Memoized like the repositories above: `intent/routes.ts` and
   * `reviewService()` (→ `ReviewRunExecutor`) each call this once at plugin
   * registration, and BOTH must resolve to the SAME instance — otherwise its
   * single-flight in-memory map (per-instance) only dedupes calls made
   * through whichever caller happened to hold that particular instance,
   * never across a manual POST and a background review-triggered derive.
   */
  intentService(): IntentService {
    return (this._intentService ??= new IntentService(
      this.intentRepo,
      () => this.github(),
      this.git,
      (provider) => this.llm(provider),
      (workspaceId) => resolveFeatureModel(this, workspaceId, 'review_intent'),
      this.config.promptLog,
    ));
  }

  /**
   * The review use case, wired from its ports.
   *
   * Composition lives here, not in the service: `ReviewService` and
   * `ReviewRunExecutor` take explicit ports so they can be constructed with
   * stubs in a test, and so neither imports the container back (which is what
   * used to make this a cycle).
   */
  reviewService(): ReviewService {
    const executor = new ReviewRunExecutor(
      this.reviewRepo,
      this.runBus,
      (provider) => this.llm(provider),
      this.repoIntel,
      this.git,
      this.skillsRepo,
      this.intentService(),
      this.contextAttachments,
      this.config.promptLog,
    );
    return new ReviewService(this.reviewRepo, this.agentsRepo, this.runBus, executor);
  }

  /**
   * F1's pulls repository, promoted here (D2) so a second module (Smart
   * Diff) can depend on it without importing `modules/pulls/repository.js`
   * sideways — `pulls/routes.ts` still constructs its own `PullsService`
   * directly (pre-existing, untouched), this getter only adds a shared,
   * memoized instance for callers that go through the container.
   */
  get pullsRepo(): PullsRepository {
    return (this._pullsRepo ??= new PullsRepository(this.db));
  }

  /**
   * The Smart Diff use case (D2). No repository of its own — `pullsRepo`
   * already exposes everything `SmartDiffStore` needs and satisfies it
   * structurally.
   */
  smartDiffService(): SmartDiffService {
    return (this._smartDiffService ??= new SmartDiffService(this.pullsRepo));
  }

  /**
   * The Blast radius use case. No repository of its own — `pullsRepo`
   * already exposes everything `BlastStore` needs; `repoIntel` (below)
   * already exposes everything `BlastIntel` needs — both satisfy their
   * respective ports structurally.
   */
  blastService(): BlastService {
    return (this._blastService ??= new BlastService(this.pullsRepo, this.repoIntel));
  }

  get briefRepo(): BriefRepository {
    return (this._briefRepo ??= new BriefRepository(this.db));
  }

  /**
   * The PR Brief use case. Memoized: its single-flight map and per-workspace
   * rate-limit windows are per-instance, so the route must always get the same
   * one. Its ports are satisfied by the memoized repositories / services (no
   * second instance of anything stateful): `pullsRepo`, `intentService()`,
   * `blastService()` and the SAME `contextAttachments` the review executor uses.
   * GitHub is resolved lazily per call (`() => this.github()`), so a token
   * rotation is picked up.
   */
  briefService(): BriefService {
    return (this._briefService ??= new BriefService(
      this.briefRepo,
      this.pullsRepo,
      this.intentService(),
      this.blastService(),
      this.contextAttachments,
      () => this.github(),
      (provider) => this.llm(provider),
      (workspaceId) => resolveFeatureModel(this, workspaceId, 'risk_brief'),
      (text) => this.tokenizer.count(text),
      wrapUntrusted,
    ));
  }

  /**
   * "Prior PRs touching these files" use case (P3). No repository of its
   * own — `pullsRepo` already exposes everything `PrHistoryStore`/
   * `PrHistoryRepos` need. Async (unlike `blastService()`) because it needs
   * `await this.github()`.
   *
   * UNLIKE `intentService()` (which passes a lazy `() => this.github()`
   * resolver so every call re-resolves through `_github`), this resolves
   * `github()` ONCE and bakes the concrete client into `PrHistoryService`.
   * `invalidateSecretCaches()` clears `_github` but never `_prHistoryService`,
   * so a `GITHUB_TOKEN` rotation has no effect on this feature until the
   * process restarts — a deliberate P3 simplification (see INSIGHTS.md), not
   * the `intentService()` pattern.
   */
  async prHistoryService(): Promise<PrHistoryService> {
    if (this._prHistoryService) return this._prHistoryService;
    const github = await this.github();
    this._prHistoryService = new PrHistoryService(this.pullsRepo, this.pullsRepo, github);
    return this._prHistoryService;
  }

  /**
   * Project Context catalog use case. Memoized: routes, the scan job handler
   * and any future consumer (attachments) must share ONE instance, because the
   * single-flight scan map lives in it.
   */
  get projectContext(): ProjectContextService {
    return (this._projectContext ??= new ProjectContextService(
      new ProjectContextRepository(this.db),
      this.git,
      this.tokenizer,
      this.jobs,
    ));
  }

  /**
   * Onboarding tour (deterministic facts). Memoized: the facts cache and single-flight map live
   * in the service. The narrative overlay is a lazy closure: `onboardingNarrative` needs this
   * service for its facts, so resolving it eagerly here would be a construction cycle.
   */
  get onboarding(): OnboardingService {
    return (this._onboarding ??= new OnboardingService(
      new OnboardingRepository(this.db),
      this.repoIntel,
      this.git,
      { forTour: (...args) => this.onboardingNarrative.forTour(...args) },
    ));
  }

  /**
   * Onboarding AI narrative. Memoized: its single-flight map and rate-limit windows are
   * per-instance, so the route and the `GET /tour` overlay must share one.
   */
  get onboardingNarrative(): OnboardingNarrativeService {
    return (this._onboardingNarrative ??= new OnboardingNarrativeService(
      new OnboardingRepository(this.db),
      this.onboarding,
      this.repoIntel,
      this.git,
      (provider) => this.llm(provider),
      (workspaceId) => resolveFeatureModel(this, workspaceId, 'onboarding'),
      (model, tokensIn, tokensOut) => this.priceBook.estimate(model, tokensIn, tokensOut),
      (text) => this.tokenizer.count(text),
      wrapUntrusted,
      () => loadPromptTemplate('onboarding.system.md'),
    ));
  }

  get evalRepo(): EvalRepository {
    return (this._evalRepo ??= new EvalRepository(this.db));
  }

  /** Agent lookup for the eval module, adapted from the agents repository. */
  private get evalAgents(): EvalAgentReader {
    return {
      get: async (workspaceId, agentId) => {
        const a = await this.agentsRepo.getById(workspaceId, agentId);
        return a
          ? {
              id: a.id,
              name: a.name,
              version: a.version,
              provider: a.provider,
              model: a.model,
              strategy: a.strategy,
              system_prompt: a.systemPrompt,
            }
          : null;
      },
    };
  }

  /** Skills selected exactly like a PR review does, plus the version each had. */
  private get evalSkills(): EvalSkillsReader {
    return {
      forAgentWithVersion: async (agentId) => {
        const skills = await this.skillsRepo.forAgent(agentId);
        const versions = await this.evalRepo.skillVersions(skills.map((s) => s.id));
        return skills.map((s) => ({ ...s, version: versions.get(s.id) ?? 1 }));
      },
    };
  }

  /**
   * Structured logger handed to the eval services (ids and numbers only, never
   * content). `app.ts` sets it to the Fastify logger right after construction;
   * a bare container (tests) falls back to JSON lines on stdout.
   */
  logger?: EvalLogger;

  private get evalLogger(): EvalLogger {
    if (this.logger) return this.logger;
    const log = (level: 'info' | 'warn' | 'error') => (obj: Record<string, unknown>, msg?: string) =>
      void process.stdout.write(`${JSON.stringify({ level, msg, ...obj })}\n`);
    return { info: log('info'), warn: log('warn'), error: log('error') };
  }

  /** Eval cases / drafts / overview / compare. Memoized with its siblings below. */
  evalService(): EvalService {
    return (this._evalService ??= new EvalService(this.evalRepo, this.evalAgents));
  }

  /** In-memory "Run case" attempts. MEMOIZED: the attempt map lives in the instance. */
  evalAttemptService(): EvalAttemptService {
    return (this._evalAttemptService ??= new EvalAttemptService(
      this.evalRepo,
      this.evalAgents,
      this.evalSkills,
      (provider) => this.llm(provider),
      this.evalLogger,
    ));
  }

  /** Sequential suite runs. MEMOIZED: the cancel flags and in-flight jobs live in the instance. */
  evalSuiteRunService(): EvalSuiteRunService {
    return (this._evalSuiteRunService ??= new EvalSuiteRunService(
      this.evalRepo,
      this.evalAgents,
      this.evalSkills,
      (provider) => this.llm(provider),
      this.evalLogger,
    ));
  }

  get ciRepo(): CiRepository {
    return (this._ciRepo ??= new CiRepository(this.db));
  }

  private get ciStore(): CiStore {
    return this.overrides.ciStore ?? this.ciRepo;
  }

  /** Agent lookup for the ci module, adapted from the agents repository. */
  private get ciAgents(): CiAgentReader {
    if (this.overrides.ciAgents) return this.overrides.ciAgents;
    return {
      get: async (workspaceId, agentId) => {
        const a = await this.agentsRepo.getById(workspaceId, agentId);
        return a
          ? {
              id: a.id,
              name: a.name,
              version: a.version,
              provider: a.provider,
              model: a.model,
              systemPrompt: a.systemPrompt,
              strategy: a.strategy,
              ciFailOn: a.ciFailOn,
            }
          : null;
      },
    };
  }

  /**
   * GitHub clients for one CI request. Resolved per call (token rotation is
   * picked up) and throws `github_token_missing` (400) when no token is set,
   * BEFORE any GitHub call is made.
   */
  private async ciGitHub(): Promise<CiGitHub> {
    if (
      !this.overrides.github &&
      !this.overrides.githubCi &&
      !(await this.secrets.get('GITHUB_TOKEN'))
    ) {
      throw new AppError(
        'github_token_missing',
        'A GitHub token is required. Add one in Settings.',
        400,
      );
    }
    return { github: await this.github(), ci: await this.githubCi() };
  }

  /** Export to CI: bundle, install (PR on `devdigest/ci`), installation list. Memoized. */
  ciService(): CiService {
    return (this._ciService ??= new CiService(
      this.ciStore,
      this.ciAgents,
      this.runnerBundle,
      () => this.ciGitHub(),
      this.evalLogger,
    ));
  }

  /** Export to CI: Refresh (ingest) and the CI Runs list. Memoized. */
  ciSyncService(): CiSyncService {
    return (this._ciSyncService ??= new CiSyncService(
      this.ciStore,
      () => this.ciGitHub(),
      this.evalLogger,
    ));
  }

  /** The prebuilt runner files shipped into every exported bundle. */
  get runnerBundle(): RunnerBundleSource {
    if (this.overrides.runnerBundle) return this.overrides.runnerBundle;
    return new FsRunnerBundleSource(this.config.runnerDir);
  }

  /** Project Context attachments (agents / skills ↔ catalog documents). Memoized, like its catalog. */
  get contextAttachments(): ContextAttachmentsService {
    return (this._contextAttachments ??= new ContextAttachmentsService(
      this.agentsRepo,
      this.skillsRepo,
      this.projectContext,
    ));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this, this.db);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  async githubCi(): Promise<GitHubCiClient> {
    if (this.overrides.githubCi) return this.overrides.githubCi;
    if (this._githubCi) return this._githubCi;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._githubCi = new OctokitGitHubCiClient(token);
    return this._githubCi;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._githubCi = undefined;
    this._embedder = undefined;
  }
}
