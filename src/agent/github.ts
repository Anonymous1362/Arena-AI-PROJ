/**
 * GitHub connector.
 *
 * Pure REST over the platform fetch — no SDK, no native module, no server. The
 * token lives in AsyncStorage on-device and is only ever sent to
 * `api.github.com`, so it works identically on iOS, Android and the PWA
 * (GitHub's API sends permissive CORS headers).
 *
 * What the agent gets:
 *  - `github_status`     verify the token, show rate-limit headroom
 *  - `github_repos`      list repositories (user or org)
 *  - `github_tree`       recursive file listing of a repo/branch
 *  - `github_read`       read a file at a ref
 *  - `github_write`      create/update a file with a real commit
 *  - `github_delete`     delete a file with a commit
 *  - `github_search`     code search inside a repo
 *  - `github_issue`      open an issue
 *  - `github_pr`         open a pull request
 *
 * `github_write` / `github_delete` are flagged `danger: 'medium'` so the
 * existing confirm-before-destructive sheet gates them.
 */
import { streamFetch } from '@/src/ai/net/fetch';
import { useSettingsStore } from '@/src/store/settings';
import type { ToolSpec, ToolResult } from '@/src/agent/tools';

const API = 'https://api.github.com';
const MEDIA = 'application/vnd.github+json';

export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export function githubConfig(): GithubConfig {
  const g = useSettingsStore.getState().github;
  return { token: (g.token ?? '').trim(), owner: (g.owner ?? '').trim(), repo: (g.repo ?? '').trim(), branch: (g.branch ?? 'main').trim() };
}

export function githubReady(): boolean {
  const { token } = githubConfig();
  return token.length > 8;
}

/* --------------------------------- base64 ---------------------------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function b64decode(input: string): string {
  const clean = input.replace(/[\s\r\n]/g, '').replace(/=+$/, '');
  let out = '';
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buf >> bits) & 0xff);
    }
  }
  // Decode UTF-8 byte sequence into text.
  try {
    return decodeURIComponent(
      out
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
  } catch {
    return out;
  }
}

export function b64encode(text: string): string {
  let bytes = '';
  try {
    const encoded = encodeURIComponent(text);
    for (let i = 0; i < encoded.length; i++) {
      if (encoded[i] === '%') {
        bytes += String.fromCharCode(parseInt(encoded.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes += encoded[i];
      }
    }
  } catch {
    bytes = text;
  }
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes.charCodeAt(i) << 16) | (bytes.charCodeAt(i + 1) << 8) | bytes.charCodeAt(i + 2);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes.charCodeAt(i) << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes.charCodeAt(i) << 16) | (bytes.charCodeAt(i + 1) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

/* --------------------------------- transport -------------------------------- */

export async function gh(
  method: string,
  path: string,
  body?: unknown,
  opts: { token?: string } = {}
): Promise<{ status: number; json: any; text: string }> {
  const token = (opts.token ?? githubConfig().token).trim();
  if (!token) throw new GithubError(0, 'No GitHub token configured. Settings → GitHub.');
  const url = path.startsWith('http') ? path : `${API}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: MEDIA,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await streamFetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.message ?? `${res.status} ${res.statusText}`;
    const doc = json?.documentation_url ? ` (${json.documentation_url})` : '';
    throw new GithubError(res.status, `GitHub ${method} ${path} → ${msg}${doc}`);
  }
  return { status: res.status, json, text };
}

/* ------------------------------ tool definitions ---------------------------- */

export const GITHUB_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'github_status',
    description: 'Verify the GitHub connection and report the authenticated user plus remaining API rate limit.',
    params: {},
    required: [],
  },
  {
    name: 'github_repos',
    description: 'List repositories. Uses the connected account by default; pass `org` for an organisation.',
    params: {
      org: { type: 'string', description: 'Organisation login (optional)' },
      limit: { type: 'number', description: 'Max repos to return (default 30)' },
    },
    required: [],
  },
  {
    name: 'github_tree',
    description: 'Recursive file listing of the connected repository (or any owner/repo you pass).',
    params: {
      owner: { type: 'string', description: 'Repo owner (defaults to the connected repo)' },
      repo: { type: 'string', description: 'Repo name (defaults to the connected repo)' },
      ref: { type: 'string', description: 'Branch/tag/sha (defaults to the configured branch)' },
      path: { type: 'string', description: 'Sub-path prefix to filter by (optional)' },
    },
    required: [],
  },
  {
    name: 'github_read',
    description: 'Read a text file from the connected GitHub repository at a ref.',
    params: {
      path: { type: 'string', description: 'File path in the repo, e.g. src/app.ts' },
      ref: { type: 'string', description: 'Branch/tag/sha (defaults to the configured branch)' },
      owner: { type: 'string', description: 'Repo owner (optional)' },
      repo: { type: 'string', description: 'Repo name (optional)' },
    },
    required: ['path'],
  },
  {
    name: 'github_write',
    description:
      'Create or update a file in the connected GitHub repository with a real commit. Fetches the current blob sha automatically so updates never conflict silently.',
    params: {
      path: { type: 'string', description: 'File path in the repo' },
      content: { type: 'string', description: 'Full new file content (UTF-8)' },
      message: { type: 'string', description: 'Commit message' },
      branch: { type: 'string', description: 'Target branch (defaults to the configured branch)' },
    },
    required: ['path', 'content', 'message'],
    danger: 'medium',
  },
  {
    name: 'github_delete',
    description: 'Delete a file from the connected GitHub repository with a commit.',
    params: {
      path: { type: 'string', description: 'File path in the repo' },
      message: { type: 'string', description: 'Commit message' },
      branch: { type: 'string', description: 'Target branch (defaults to the configured branch)' },
    },
    required: ['path', 'message'],
    danger: 'medium',
  },
  {
    name: 'github_search',
    description: 'Search code inside the connected repository.',
    params: {
      query: { type: 'string', description: 'Search terms, e.g. "getUser repo:me/app"' },
    },
    required: ['query'],
  },
  {
    name: 'github_issue',
    description: 'Open an issue on the connected repository.',
    params: {
      title: { type: 'string', description: 'Issue title' },
      body: { type: 'string', description: 'Markdown body' },
      labels: { type: 'string', description: 'Comma-separated labels (optional)' },
    },
    required: ['title'],
    danger: 'medium',
  },
  {
    name: 'github_pr',
    description: 'Open a pull request on the connected repository.',
    params: {
      title: { type: 'string', description: 'PR title' },
      body: { type: 'string', description: 'Markdown body' },
      head: { type: 'string', description: 'Source branch' },
      base: { type: 'string', description: 'Target branch (defaults to the configured branch)' },
    },
    required: ['title', 'head'],
    danger: 'medium',
  },
];

/* --------------------------------- dispatch --------------------------------- */

function repoParts(args: Record<string, unknown>) {
  const cfg = githubConfig();
  const owner = String(args.owner ?? cfg.owner).trim();
  const repo = String(args.repo ?? cfg.repo).trim();
  if (!owner || !repo) throw new GithubError(0, 'No repository selected. Settings → GitHub → owner/repo.');
  return { owner, repo, branch: String(args.branch ?? args.ref ?? (cfg.branch || 'main')).trim() };
}

export async function dispatchGithubTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (!githubReady()) {
    return { ok: false, output: 'GitHub is not connected. Open Settings → GitHub, paste a token and pick a repository.' };
  }
  try {
    switch (name) {
      case 'github_status': {
        const { json: user } = await gh('GET', '/user');
        const { json: rate } = await gh('GET', '/rate_limit').catch(() => ({ json: null, status: 0, text: '' }));
        const core = rate?.resources?.core;
        return {
          ok: true,
          output: [
            `Connected as @${user?.login ?? '?'} (${user?.name ?? 'no name'})`,
            `Plan: ${user?.plan?.name ?? 'unknown'} · public repos: ${user?.public_repos ?? '?'}`,
            core ? `Rate limit: ${core.remaining}/${core.limit} remaining, resets ${new Date(core.reset * 1000).toLocaleTimeString()}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }

      case 'github_repos': {
        const org = String(args.org ?? '').trim();
        const limit = Math.min(100, Math.max(1, Number(args.limit ?? 30)));
        const path = org ? `/orgs/${encodeURIComponent(org)}/repos` : '/user/repos';
        const { json } = await gh('GET', `${path}?per_page=${limit}&sort=pushed&affiliation=owner,collaborator,organization_member`);
        const rows = (Array.isArray(json) ? json : []).map(
          (r: any) => `- ${r.full_name}  (${r.private ? 'private' : 'public'}${r.fork ? ', fork' : ''})  ★${r.stargazers_count}  pushed ${String(r.pushed_at ?? '').slice(0, 10)}  ${r.description ?? ''}`
        );
        return { ok: true, output: rows.length ? rows.join('\n') : '(no repositories found)' };
      }

      case 'github_tree': {
        const { owner, repo, branch } = repoParts(args);
        const prefix = String(args.path ?? '').trim();
        const { json } = await gh('GET', `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
        const entries = (json?.tree ?? [])
          .filter((t: any) => !prefix || String(t.path).startsWith(prefix.replace(/\/$/, '')))
          .slice(0, 500)
          .map((t: any) => `${t.type === 'tree' ? 'd' : 'f'} ${t.path}${t.size ? `  (${t.size}b)` : ''}`);
        const truncated = json?.truncated ? '\n…(truncated by GitHub — narrow the path)' : '';
        return { ok: true, output: (entries.join('\n') || '(empty)') + truncated };
      }

      case 'github_read': {
        const { owner, repo, branch } = repoParts(args);
        const path = String(args.path ?? '').replace(/^\/+/, '');
        if (!path) return { ok: false, output: 'github_read: missing path' };
        const { json } = await gh('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
        if (json?.encoding === 'base64') {
          const text = b64decode(json.content ?? '');
          return { ok: true, output: `${path} @ ${branch} (sha ${String(json.sha).slice(0, 10)})\n${'─'.repeat(24)}\n${text}` };
        }
        return { ok: false, output: `Unexpected response for ${path}: ${JSON.stringify(json).slice(0, 400)}` };
      }

      case 'github_write': {
        const { owner, repo } = repoParts(args);
        const branch = String(args.branch ?? (githubConfig().branch || 'main'));
        const path = String(args.path ?? '').replace(/^\/+/, '');
        const content = String(args.content ?? '');
        const message = String(args.message ?? `Update ${path}`);
        if (!path) return { ok: false, output: 'github_write: missing path' };

        // Existing blob sha (required by the API for updates).
        let sha: string | undefined;
        try {
          const { json } = await gh('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
          sha = json?.sha;
        } catch {
          /* new file */
        }

        const { json } = await gh('PUT', `/repos/${owner}/${repo}/contents/${path}`, {
          message,
          content: b64encode(content),
          branch,
          ...(sha ? { sha } : {}),
        });
        return {
          ok: true,
          output: `${sha ? 'Updated' : 'Created'} ${path} on ${owner}/${repo}@${branch}\ncommit ${String(json?.commit?.sha ?? '').slice(0, 10)} — ${json?.commit?.message ?? message}\n${json?.commit?.html_url ?? ''}`,
        };
      }

      case 'github_delete': {
        const { owner, repo } = repoParts(args);
        const branch = String(args.branch ?? (githubConfig().branch || 'main'));
        const path = String(args.path ?? '').replace(/^\/+/, '');
        const message = String(args.message ?? `Delete ${path}`);
        const { json: current } = await gh('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
        const { json } = await gh('DELETE', `/repos/${owner}/${repo}/contents/${path}`, {
          message,
          sha: current?.sha,
          branch,
        });
        return { ok: true, output: `Deleted ${path} on ${owner}/${repo}@${branch}\ncommit ${String(json?.commit?.sha ?? '').slice(0, 10)}` };
      }

      case 'github_search': {
        const { owner, repo } = repoParts(args);
        const q = String(args.query ?? '').trim();
        if (!q) return { ok: false, output: 'github_search: missing query' };
        const qualified = /repo:/.test(q) ? q : `${q} repo:${owner}/${repo}`;
        const { json } = await gh('GET', `/search/code?q=${encodeURIComponent(qualified)}&per_page=25`);
        const items = (json?.items ?? []).map((i: any) => `- ${i.path}  (${i.repository?.full_name})  ${i.html_url}`);
        return {
          ok: true,
          output: items.length ? items.join('\n') : `No matches for “${q}”. (Code search needs a token with repo scope.)`,
        };
      }

      case 'github_issue': {
        const { owner, repo } = repoParts(args);
        const labels = String(args.labels ?? '')
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean);
        const { json } = await gh('POST', `/repos/${owner}/${repo}/issues`, {
          title: String(args.title ?? ''),
          body: String(args.body ?? ''),
          ...(labels.length ? { labels } : {}),
        });
        return { ok: true, output: `Opened issue #${json?.number}: ${json?.title}\n${json?.html_url ?? ''}` };
      }

      case 'github_pr': {
        const { owner, repo } = repoParts(args);
        const base = String(args.base ?? (githubConfig().branch || 'main'));
        const { json } = await gh('POST', `/repos/${owner}/${repo}/pulls`, {
          title: String(args.title ?? ''),
          body: String(args.body ?? ''),
          head: String(args.head ?? ''),
          base,
        });
        return { ok: true, output: `Opened PR #${json?.number}: ${json?.title}\n${json?.html_url ?? ''}` };
      }

      default:
        return { ok: false, output: `Unknown GitHub tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

export const GITHUB_TOOL_NAMES = new Set(GITHUB_TOOL_SPECS.map((t) => t.name));

/* ------------------------------ repo → sandbox ------------------------------ */

export interface CloneProgress {
  done: number;
  total: number;
  path: string;
}

export interface CloneResult {
  files: number;
  bytes: number;
  skipped: number;
  error?: string;
}

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 400;

/**
 * Pulls a repository down into the agent's jailed storage root so the file
 * tools and the shell can work on real source without Termux, a dev server or
 * any second app. Text files only, capped by size and count — it is a working
 * copy for the agent, not `git clone`.
 */
export async function cloneRepoIntoSandbox(
  opts: { onProgress?: (p: CloneProgress) => void; subPath?: string; rootPrefix?: string } = {}
): Promise<CloneResult> {
  const { writeAgentFile } = await import('@/src/agent/fs');
  const { owner, repo, branch } = githubConfig();
  if (!owner || !repo) return { files: 0, bytes: 0, skipped: 0, error: 'No repository selected.' };
  if (!githubReady()) return { files: 0, bytes: 0, skipped: 0, error: 'No GitHub token configured.' };

  try {
    const { json } = await gh('GET', `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const blobs = (json?.tree ?? [])
      .filter((t: any) => t.type === 'blob')
      .filter((t: any) => !opts.subPath || String(t.path).startsWith(opts.subPath.replace(/\/$/, '')))
      .filter((t: any) => !/(\.png|\.jpe?g|\.gif|\.webp|\.mp4|\.zip|\.gz|\.pdf|\.woff2?|\.ttf|\.ico|\.lock)$/i.test(t.path))
      .slice(0, MAX_FILES);

    let files = 0;
    let bytes = 0;
    let skipped = 0;
    for (let i = 0; i < blobs.length; i++) {
      const entry = blobs[i];
      opts.onProgress?.({ done: i, total: blobs.length, path: entry.path });
      if (entry.size > MAX_FILE_BYTES) {
        skipped++;
        continue;
      }
      try {
        const { json: file } = await gh('GET', `/repos/${owner}/${repo}/contents/${entry.path}?ref=${encodeURIComponent(branch)}`);
        if (file?.encoding !== 'base64') {
          skipped++;
          continue;
        }
        const text = b64decode(file.content ?? '');
        const dest = opts.rootPrefix ? `${opts.rootPrefix.replace(/\/$/, '')}/${entry.path}` : entry.path;
        await writeAgentFile(dest, text, MAX_FILE_BYTES);
        files++;
        bytes += text.length;
      } catch {
        skipped++;
      }
    }
    opts.onProgress?.({ done: blobs.length, total: blobs.length, path: 'done' });
    return { files, bytes, skipped };
  } catch (e) {
    return { files: 0, bytes: 0, skipped: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
