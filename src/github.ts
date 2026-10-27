import type { Env } from "./types";

const API_BASE = "https://api.github.com";

function headers(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "apple-health-worker",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export interface GetFileResult {
  sha: string | null;
  content: string | null; // decoded text, null if file doesn't exist
}

export async function getFile(env: Env, path: string): Promise<GetFileResult> {
  const url = `${API_BASE}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_DATA_BRANCH}`;
  const res = await fetch(url, { headers: headers(env) });
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) {
    throw new Error(`GitHub getFile ${path} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json<{ sha: string; content?: string }>();

  // The Contents API only inlines `content` for files under ~1MB; above
  // that it still returns 200 with sha/size but an empty content field,
  // which looks identical to "the file exists and is empty" unless you
  // check for it. Fall back to the Git Blobs API (no such size limit,
  // handles files up to 100MB) whenever content wasn't inlined.
  const content =
    json.content && json.content.trim() !== ""
      ? atob(json.content.replace(/\n/g, ""))
      : await getBlobContent(env, json.sha);

  return { sha: json.sha, content };
}

async function getBlobContent(env: Env, sha: string): Promise<string> {
  const url = `${API_BASE}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/blobs/${sha}`;
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) {
    throw new Error(`GitHub getBlob ${sha} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json<{ content: string }>();
  return atob(json.content.replace(/\n/g, ""));
}

export async function putFile(
  env: Env,
  path: string,
  content: string,
  message: string,
  sha: string | null
): Promise<void> {
  const url = `${API_BASE}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const body: Record<string, unknown> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: env.GITHUB_DATA_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers(env), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub putFile ${path} failed: ${res.status} ${await res.text()}`);
  }
}

export async function getJson<T>(env: Env, path: string): Promise<{ data: T | null; sha: string | null }> {
  const { sha, content } = await getFile(env, path);
  if (content === null) return { data: null, sha: null };
  return { data: JSON.parse(content) as T, sha };
}

export async function putJson(env: Env, path: string, data: unknown, message: string, sha: string | null): Promise<void> {
  await putFile(env, path, JSON.stringify(data, null, 2), message, sha);
}

async function api<T>(env: Env, path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers(env), ...(opts.headers ?? {}) } });
  if (!res.ok) throw new Error(`GitHub ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface BulkFile {
  path: string;
  content: string; // UTF-8 text content
}

/**
 * Commits many files in ONE git commit via the Git Data API (a tree with
 * inline `content` per entry — GitHub creates the blobs for us), instead of
 * one REST "contents" PUT per file. Used for bulk historical imports where
 * writing hundreds or thousands of files one at a time would be far too
 * slow and would bloat history with one commit per file.
 */
export async function bulkCommit(env: Env, files: BulkFile[], message: string): Promise<void> {
  const repo = `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const branch = env.GITHUB_DATA_BRANCH;

  const ref = await api<{ object: { sha: string } }>(env, `/repos/${repo}/git/ref/heads/${branch}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await api<{ tree: { sha: string } }>(env, `/repos/${repo}/git/commits/${baseCommitSha}`);

  const tree = await api<{ sha: string }>(env, `/repos/${repo}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    }),
  });

  const commit = await api<{ sha: string }>(env, `/repos/${repo}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseCommitSha] }),
  });

  await api(env, `/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha }),
  });
}
