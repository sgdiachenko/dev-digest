/**
 * README scanner: headings and fenced shell blocks under a setup-like heading.
 * Plain-text scan; the result is shown verbatim and never executed (AC-54).
 */
import { SETUP_HEADING_RE, SHELL_FENCE_LANGS } from './constants.js';

export interface ReadmeCommand {
  command: string;
  /** Text of the nearest heading (the source key, AC-21). */
  heading: string;
}

export interface ReadmeFacts {
  headings: string[];
  commands: ReadmeCommand[];
  /** True when some heading is about setup, install, running or getting started. */
  hasSetupSection: boolean;
}

const REMOTE_PIPE_RE =
  /\b(?:curl|wget|fetch)\b[^\n|]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:ba|z|da|k|a)?sh\b|\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:python[0-9.]*|node|perl|ruby|php)\b|\b(?:ba|z|da|k)?sh\s+(?:-c\s+)?["']?\$\(\s*(?:curl|wget)\b|\b(?:ba|z|da|k)?sh\s+<\(\s*(?:curl|wget)\b/;

/** True when the command pipes downloaded content into a shell or interpreter. */
export function detectRemoteCode(command: string): boolean {
  return REMOTE_PIPE_RE.test(command);
}

function shellCommands(body: string[]): string[] {
  const out: string[] = [];
  let pending = '';
  for (const raw of body) {
    let line = raw.trim();
    if (pending === '' && (line === '' || line.startsWith('#'))) continue;
    if (pending === '') line = line.replace(/^[$>]\s+/, '');
    const continued = line.endsWith('\\');
    pending += (pending === '' ? '' : ' ') + (continued ? line.slice(0, -1).trim() : line);
    if (!continued) {
      if (pending !== '') out.push(pending);
      pending = '';
    }
  }
  if (pending !== '') out.push(pending);
  return out;
}

export function parseReadme(text: string): ReadmeFacts {
  const headings: string[] = [];
  const stack: Array<{ level: number; text: string }> = [];
  const commands: ReadmeCommand[] = [];
  let fence: { ch: string; len: number; lang: string; setup: boolean; heading: string; body: string[] } | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close?.[1] && close[1][0] === fence.ch && close[1].length >= fence.len) {
        if (fence.setup && SHELL_FENCE_LANGS.includes(fence.lang)) {
          for (const c of shellCommands(fence.body)) commands.push({ command: c, heading: fence.heading });
        }
        fence = null;
      } else fence.body.push(line);
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (open?.[1]) {
      const current = stack.at(-1)?.text ?? '';
      fence = {
        ch: open[1][0] ?? '`',
        len: open[1].length,
        lang: (open[2] ?? '').toLowerCase(),
        setup: stack.some((h) => SETUP_HEADING_RE.test(h.text)),
        heading: current,
        body: [],
      };
      continue;
    }
    const h = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h?.[1] && h[2]) {
      const level = h[1].length;
      while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) stack.pop();
      stack.push({ level, text: h[2] });
      headings.push(h[2]);
    }
  }
  return { headings, commands, hasSetupSection: headings.some((t) => SETUP_HEADING_RE.test(t)) };
}
