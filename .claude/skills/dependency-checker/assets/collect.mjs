#!/usr/bin/env node
// Collects dependency facts for every package of the repo. Read-only, no deps.
//   node collect.mjs            # JSON to stdout
//   node collect.mjs --pkg server --pkg client
// Numbers (sizes, usage counts, drift) come from here; judgement comes from the skill.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("../../../..", import.meta.url).pathname);
const ALL = ["server", "client", "reviewer-core", "mcp-server", "e2e", "evals"];
const argv = process.argv.slice(2);
const only = argv.flatMap((a, i) => (a === "--pkg" ? [argv[i + 1]] : []));
const PKGS = (only.length ? only : ALL).filter((p) => existsSync(join(ROOT, p, "package.json")));

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "coverage", "clones", ".turbo"]);
const SRC_EXT = /\.(m?[jt]sx?|cjs)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SRC_EXT.test(name)) out.push(p);
  }
  return out;
}

function sizeKb(path) {
  try {
    // -L follows pnpm symlinks into the content-addressed store
    return Number(execFileSync("du", ["-skL", path], { encoding: "utf8" }).split("\t")[0]);
  } catch {
    return null;
  }
}

function hasBin(dir, name) {
  try {
    return Boolean(JSON.parse(readFileSync(join(dir, "node_modules", name, "package.json"), "utf8")).bin);
  } catch {
    return false;
  }
}

const importRe = (name) =>
  new RegExp(`(?:from\\s*|import\\s*\\(?\\s*|require\\(\\s*)['"]${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?:/[^'"]*)?['"]`);

function aliasTarget(pkg, target) {
  const abs = resolve(join(ROOT, pkg), target);
  const owner = ALL.find((p) => abs.startsWith(join(ROOT, p) + "/"));
  const rel = abs.replace(ROOT + "/", "");
  return owner === pkg ? `${pkg} (${rel.replace(/\/index\.ts$|\/\*$/, "")})` : (owner ?? rel).toString() + (owner ? ` (${rel.replace(/\/index\.ts$|\/\*$/, "")})` : "");
}

const packages = {};
const byName = {};
const internal = [];

for (const pkg of PKGS) {
  const dir = join(ROOT, pkg);
  const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const files = walk(dir).map((f) => ({ f, text: readFileSync(f, "utf8") }));
  const srcFiles = files.filter(({ f }) => /\/(src|app|lib|scripts)\//.test(f) && !/\.(test|spec)\./.test(f));
  const testFiles = files.filter(({ f }) => /\.(test|spec)\.|\/(test|tests|e2e|specs)\//.test(f));
  const scripts = JSON.stringify(json.scripts ?? {});
  const configs = files.filter(({ f }) => /(config|\.setup|rc)\.[mc]?[jt]s$/.test(f));

  const rows = [];
  for (const [kind, deps] of [["dependencies", json.dependencies], ["devDependencies", json.devDependencies], ["optionalDependencies", json.optionalDependencies]]) {
    for (const [name, spec] of Object.entries(deps ?? {})) {
      const re = importRe(name);
      const inSrc = srcFiles.filter(({ text }) => re.test(text)).length;
      const inTests = testFiles.filter(({ text }) => re.test(text)).length;
      const inConfig = configs.filter(({ text }) => re.test(text)).length + (scripts.includes(name.replace(/^@[^/]+\//, "")) ? 1 : 0);
      const kb = sizeKb(join(dir, "node_modules", name));
      const row = { name, spec, kind, size_kb: kb, used_in: { src: inSrc, tests: inTests, config_or_scripts: inConfig } };
      row.tooling = hasBin(dir, name) || name.startsWith("@types/") || name === "typescript";
      // CLI/tooling packages are consumed by scripts, configs or the shell, not by imports — never flag them
      row.unused_candidate = inSrc + inTests + inConfig === 0 && !row.tooling;
      rows.push(row);
      (byName[name] ??= []).push({ pkg, spec, kind });
    }
  }
  packages[pkg] = {
    manager: existsSync(join(dir, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(dir, "package-lock.json")) ? "npm" : "unknown",
    installed: existsSync(join(dir, "node_modules")),
    node_modules_kb: existsSync(join(dir, "node_modules")) ? sizeKb(join(dir, "node_modules")) : null,
    deps: rows.sort((a, b) => (b.size_kb ?? -1) - (a.size_kb ?? -1)),
  };

  // internal cross-package edges: relative imports escaping the package, and alias imports
  const tsconfig = join(dir, "tsconfig.json");
  const aliases = [];
  if (existsSync(tsconfig)) {
    // tsconfig is JSONC (comments, trailing commas): pull the "paths" block with a regex, not JSON.parse
    const block = readFileSync(tsconfig, "utf8").match(/"paths"\s*:\s*\{([\s\S]*?)\n\s*\}/);
    for (const m of (block?.[1] ?? "").matchAll(/"([^"]+)"\s*:\s*\[\s*"([^"]+)"/g)) aliases.push({ alias: m[1], targets: [m[2]] });
  }
  packages[pkg].path_aliases = aliases;
  for (const { f, text } of srcFiles.concat(testFiles)) {
    for (const m of text.matchAll(/from\s*['"]((?:\.\.\/)+[^'"]*)['"]/g)) {
      const target = resolve(join(f, ".."), m[1]);
      const owner = ALL.find((p) => target.startsWith(join(ROOT, p) + "/"));
      if (owner && owner !== pkg) internal.push({ from: f.replace(ROOT + "/", ""), to_package: owner, via: "relative", spec: m[1] });
    }
    for (const a of aliases) {
      const prefix = a.alias.replace(/\*$/, "");
      if (prefix && new RegExp(`from\\s*['"]${prefix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`).test(text))
        internal.push({ from: f.replace(ROOT + "/", ""), to_package: aliasTarget(pkg, a.targets[0]), via: `alias ${a.alias}` });
    }
  }
}

const drift = Object.entries(byName)
  .filter(([, v]) => new Set(v.map((x) => x.spec)).size > 1)
  .map(([name, v]) => ({ name, declared: v }));

const dupes = Object.entries(byName)
  .filter(([, v]) => v.length > 1)
  .map(([name, v]) => ({ name, packages: v.map((x) => x.pkg) }));

const edgeCount = {};
for (const e of internal) {
  const key = `${e.from.split("/")[0]} -> ${e.to_package} (${e.via})`;
  edgeCount[key] = (edgeCount[key] ?? 0) + 1;
}

console.log(
  JSON.stringify(
    {
      root: ROOT,
      generated: new Date().toISOString(),
      limits: [
        "usage = import/require string match in source, tests and config/scripts; dynamic or transitive use is invisible (unused_candidate is a hint, not proof)",
        "size_kb = du -skL of node_modules/<name>: package itself, not its transitive tree",
        "packages without node_modules report size_kb null — run the package install first",
      ],
      packages,
      drift,
      duplicated_across_packages: dupes,
      internal_edges: edgeCount,
      internal_edge_samples: [...internal.filter((e) => e.via === "relative"), ...internal.filter((e) => e.via !== "relative")].slice(0, 40),
    },
    null,
    2,
  ),
);
