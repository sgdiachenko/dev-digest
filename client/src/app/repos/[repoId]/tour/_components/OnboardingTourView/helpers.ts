import type { Onboarding, OnboardingCommand, OnboardingNarrativeSections, OnboardingSections } from "@/lib/types";
import { githubBlobUrl, githubTreeUrl } from "@/lib/github-urls";
import { SECTION_IDS, type SectionId } from "./constants";

/** Translator shape the pure helpers need (callers adapt next-intl's `t`). */
export type TourT = (key: string, values?: Record<string, string | number>) => string;

/** `#architecture` → "architecture"; an unknown or empty hash → null (stay at the top). */
export function parseHash(hash: string): SectionId | null {
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  return (SECTION_IDS as readonly string[]).includes(id) ? (id as SectionId) : null;
}

/** A backtick fence longer than any backtick run inside `text` (min 3), so the content can't close it. */
export function fenceFor(text: string): string {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return "`".repeat(Math.max(3, longest + 1));
}

/** `<repo-name>-onboarding-<sha7>.md`; characters unsafe in a file name become "-". */
export function exportFileName(repoName: string, sha: string | null): string {
  const safe = repoName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "") || "repo";
  return `${safe}-onboarding-${(sha ?? "unknown").slice(0, 7)}.md`;
}

/** Structured arguments for the `architecture.summary` message — the template itself lives in the i18n file. */
export function summaryArgs(
  sections: OnboardingSections,
  none: string,
): { stack: string; entryPoints: string; modules: number } {
  const stack = sections.architecture.stack.map((e) => e.name).join(", ");
  const entryPoints = sections.critical_paths.items
    .filter((i) => i.tags.includes("entry_point"))
    .map((i) => i.path)
    .join(", ");
  return {
    stack: stack || none,
    entryPoints: entryPoints || none,
    modules: sections.architecture.modules.length,
  };
}

/** i18n key (inside the `onboarding` namespace) of a first-task title template; the title takes `{path}`. */
export function taskTitleKey(signal: string): string {
  return `firstTasks.title.${signal}`;
}

/** GitHub URL of a repo path pinned to `sha`: file → blob, directory → tree. Segments are encoded. */
export function fileUrl(
  repoFullName: string,
  sha: string,
  path: string,
  kind: "file" | "directory",
): string {
  return kind === "directory" ? githubTreeUrl(repoFullName, sha, path) : githubBlobUrl(repoFullName, sha, path);
}

const MAX_TAIL = 24;
const LONG_NAME_TAIL = 12;

/** Splits a path so CSS can ellipsize `head` while `tail` (the file name) stays whole. */
export function splitForMiddleTruncation(path: string): { head: string; tail: string } {
  const slash = path.lastIndexOf("/");
  let cut = slash > 0 ? slash : path.length;
  if (slash <= 0 || path.length - cut > MAX_TAIL) cut = path.length - LONG_NAME_TAIL;
  if (cut <= 0) return { head: path, tail: "" };
  // never cut inside a surrogate pair
  const code = path.charCodeAt(cut);
  if (code >= 0xdc00 && code <= 0xdfff) cut -= 1;
  return { head: path.slice(0, cut), tail: path.slice(cut) };
}

/** "5m ago"-style age of an ISO instant; a local copy of the other pages' formatter. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** A dollar amount; sub-cent values keep four decimals so they don't read as $0.00. */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(usd > 0 && usd < 0.01 ? 4 : 2)}`;
}

/** Every path the current facts mention (modules, stack evidence, critical, reading, tasks): the "current index". */
export function currentPathsOf(sections: OnboardingSections): Set<string> {
  const paths = new Set<string>();
  for (const m of sections.architecture.modules) paths.add(m.path);
  for (const e of sections.architecture.stack) paths.add(e.evidence_path);
  for (const i of sections.critical_paths.items) paths.add(i.path);
  for (const i of sections.reading_path.items) paths.add(i.path);
  for (const i of sections.first_tasks.items) paths.add(i.path);
  return paths;
}

function commandBlock(c: OnboardingCommand): string {
  const fence = fenceFor(c.command);
  return `${fence}sh\n${c.command}\n${fence}`;
}

/** Markdown export: header facts plus all five sections; each command in a fence nothing inside can close. */
export function buildMarkdown(tour: Onboarding, repoName: string, t: TourT): string {
  const sha = tour.source_sha?.slice(0, 7) ?? "";
  const lines: string[] = [`# ${t("title", { repo: repoName })}`, ""];
  if (sha) lines.push(`- ${t("export.commit")}: ${sha}`);
  lines.push(
    `- ${t("export.indexed")}: ${tour.index.files_indexed}${
      tour.index.files_in_repo != null ? ` / ${tour.index.files_in_repo}` : ""
    }`,
    `- ${t("export.status")}: ${tour.index.status}`,
    "",
  );
  const s = tour.sections;
  if (!s) return lines.join("\n");
  const n: OnboardingNarrativeSections | undefined = tour.narrative?.sections;
  const labelFor = (narrative: unknown) => `_${t(narrative != null ? "export.aiWritten" : "export.fromFacts")}_`;

  const arch = n?.architecture ?? null;
  lines.push(`## ${t("sections.architecture")}`, labelFor(arch), "", arch ? arch.body_markdown : s.architecture.summary, "");
  if (arch?.diagram_mermaid) {
    const fence = fenceFor(arch.diagram_mermaid);
    lines.push(`${fence}mermaid`, arch.diagram_mermaid, fence, "");
  }
  for (const e of s.architecture.stack) lines.push(`- ${e.name} (${e.evidence_path})`);
  for (const m of s.architecture.modules) lines.push(`- \`${m.path}\` — ${m.file_count}`);

  const describe = (items: { path: string; description: string }[] | null | undefined) =>
    new Map((items ?? []).map((x) => [x.path, x.description]));

  const critical = describe(n?.critical_paths);
  lines.push("", `## ${t("sections.critical_paths")}`, labelFor(n?.critical_paths), "");
  for (const i of s.critical_paths.items) {
    const d = critical.get(i.path);
    lines.push(d ? `- \`${i.path}\` — ${d}` : `- \`${i.path}\``);
  }

  const notes = new Map((n?.run_locally ?? []).map((x) => [x.command_id, x.note]));
  lines.push("", `## ${t("sections.run_locally")}`, labelFor(n?.run_locally), "");
  for (const g of s.run_locally.groups) {
    lines.push(`### ${g.package_path || t("runLocally.rootGroup")}`, "");
    for (const c of g.commands) {
      lines.push(commandBlock(c), "");
      const note = notes.get(c.id);
      if (note) lines.push(note, "");
    }
  }

  const reading = describe(n?.reading_path);
  lines.push(`## ${t("sections.reading_path")}`, labelFor(n?.reading_path), "");
  s.reading_path.items.forEach((i, k) => {
    const d = reading.get(i.path);
    lines.push(d ? `${k + 1}. \`${i.path}\` — ${d}` : `${k + 1}. \`${i.path}\``);
  });

  const tasks = new Map((n?.first_tasks ?? []).map((x) => [x.task_id, x]));
  lines.push("", `## ${t("sections.first_tasks")}`, labelFor(n?.first_tasks), "");
  for (const i of s.first_tasks.items) {
    const ai = tasks.get(i.id);
    lines.push(
      ai ? `- ${ai.title} — ${ai.description}` : `- ${t(taskTitleKey(i.signal), { path: i.path })}`,
    );
  }

  return `${lines.join("\n")}\n`;
}
