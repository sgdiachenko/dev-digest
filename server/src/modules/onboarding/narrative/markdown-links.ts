const INLINE_LINK = /!?\[([^\]]*)\]\((?:[^()\s]|\([^()]*\))*(?:\s+"[^"]*")?\)/g;
const REF_DEF = /^[ ]{0,3}\[[^\]]+\]:\s+\S.*$/gm;
const SEGMENT = /`([^`\n]+)`|[A-Za-z0-9_.@/-]+/g;

function href(path: string): string {
  return `repo:${path.replace(/[()\s<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}`;
}

function link(path: string): string {
  return `[${path.replace(/[[\]]/g, '\\$&')}](${href(path)})`;
}

function linkPaths(text: string, paths: ReadonlySet<string>): string {
  return text.replace(SEGMENT, (match, code: string | undefined) => {
    if (code !== undefined) return paths.has(code) ? link(code) : match;
    if (paths.has(match)) return link(match);
    const trimmed = match.replace(/[.\-/]+$/, '');
    if (trimmed !== match && paths.has(trimmed)) {
      return link(trimmed) + match.slice(trimmed.length);
    }
    return match;
  });
}

/**
 * Rewrites model Markdown so only known repository paths become links
 * (`[path](repo:path)`); every other Markdown link/image/reference is reduced
 * to its text. Fenced code is left alone; raw HTML is not touched (the client
 * never renders it).
 */
export function rewriteLinks(md: string, paths: ReadonlySet<string>): string {
  const stripped = md.replace(INLINE_LINK, '$1').replace(REF_DEF, '');
  // Split on fenced code blocks; odd indexes are fences.
  return stripped
    .split(/(^```[^\n]*\n[\s\S]*?^```[^\n]*$)/m)
    .map((part, i) => (i % 2 === 1 ? part : linkPaths(part, paths)))
    .join('');
}
