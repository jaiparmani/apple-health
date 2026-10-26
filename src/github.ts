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
  const json = await res.json<{ sha: string; content: string }>();
  const content = atob(json.content.replace(/\n/g, ""));
  return { sha: json.sha, content };
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
