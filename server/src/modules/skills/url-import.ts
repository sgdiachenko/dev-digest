import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { ValidationError } from '../../platform/errors.js';
import { parseMarkdownSkill } from './helpers.js';
import type { SkillDraft } from '@devdigest/shared';

const MAX_URL_BYTES = 100_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

/** Google Drive's /view URL serves HTML. Convert only its known public-file
 * shape to Drive's download endpoint; the result still passes HTTPS, DNS and
 * content-type checks, including every redirect. */
export function resolveSkillDownloadUrl(raw: string): URL {
  const url = validateSkillUrl(raw);
  if (url.hostname !== 'drive.google.com') return url;
  const file = /^\/file\/d\/([A-Za-z0-9_-]+)\/view\/?$/.exec(url.pathname);
  if (!file) return url;
  return validateSkillUrl(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(file[1]!)}`);
}

export function validateSkillUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ValidationError('Enter a valid HTTPS skill URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new ValidationError('Skill URL must use HTTPS without credentials or a custom port');
  }
  if (!url.hostname || isIP(url.hostname) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    throw new ValidationError('Skill URL must use a public hostname');
  }
  return url;
}

/** Fail closed for IPv6, and reject every non-global IPv4 range before a socket
 * is opened. The approved IPv4 is pinned in the HTTPS lookup callback. */
export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  if (a === undefined || b === undefined || c === undefined) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

async function fetchText(url: URL): Promise<{ status: number; location?: string; body: string }> {
  const addresses = await lookup(url.hostname, { all: true });
  const address = addresses.find((a) => isPublicIpv4(a.address));
  if (!address || addresses.some((a) => a.family === 4 && !isPublicIpv4(a.address))) {
    throw new ValidationError('Skill URL does not resolve to a public IPv4 address');
  }
  return new Promise((resolve, reject) => {
    const req = request(url, {
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: address.address, family: 4 }]);
        else callback(null, address.address, 4);
      },
      timeout: TIMEOUT_MS,
      headers: { Accept: 'text/markdown, text/plain;q=0.9', 'User-Agent': 'DevDigest-skill-import/1.0' },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        resolve({ status, location: res.headers.location, body: '' });
        return;
      }
      if (status !== 200) { res.resume(); reject(new ValidationError(`Skill URL returned HTTP ${status}`)); return; }
      const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
      if (!/^(text\/plain|text\/markdown|application\/octet-stream|application\/binary)/.test(contentType)) {
        res.resume(); reject(new ValidationError('Skill URL must return Markdown text')); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_URL_BYTES) { req.destroy(new ValidationError('Skill URL content is too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
          if (body.includes('\0')) throw new ValidationError('Skill URL must return Markdown text');
          resolve({ status, body });
        } catch (error) { reject(error); }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new ValidationError('Skill URL timed out')));
    req.on('error', reject);
    req.end();
  });
}

export async function importSkillFromUrl(rawUrl: string): Promise<SkillDraft> {
  let url = resolveSkillDownloadUrl(rawUrl);
  const filename = url.hostname === 'drive.google.com' && url.pathname === '/uc'
    ? 'SKILL.md' : url.pathname.split('/').pop() || 'skill.md';
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const result = await fetchText(url);
    if (result.status === 200) {
      return parseMarkdownSkill(filename, result.body, 'imported_url');
    }
    if (!result.location || redirects === MAX_REDIRECTS) throw new ValidationError('Skill URL redirected too many times');
    url = validateSkillUrl(new URL(result.location, url).toString());
  }
  throw new ValidationError('Skill URL redirected too many times');
}
