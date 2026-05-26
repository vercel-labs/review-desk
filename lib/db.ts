import { Redis } from "@upstash/redis";

import type { AuditEntry, Post, PostStatus, User } from "./types";

const SEED_USERS: User[] = [
  { id: "u_alice", name: "Alice", banned: false },
  { id: "u_bob", name: "Bob", banned: false },
  { id: "u_carol", name: "Carol", banned: false },
];

const KEY_USERS_INDEX = "users:index";
const KEY_POSTS_INDEX = "posts:index";
const userKey = (id: string) => `user:${id}`;
const postKey = (id: string) => `post:${id}`;
const auditKey = (postId: string) => `audit:${postId}`;

let _redis: Redis | null = null;
let _seeded = false;

function redis(): Redis {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

async function ensureSeed(): Promise<void> {
  if (_seeded) return;
  const r = redis();
  const exists = await r.scard(KEY_USERS_INDEX);
  if (exists === 0) {
    const p = r.pipeline();
    for (const u of SEED_USERS) {
      p.hset(userKey(u.id), {
        id: u.id,
        name: u.name,
        banned: u.banned ? "1" : "0",
      });
      p.sadd(KEY_USERS_INDEX, u.id);
    }
    await p.exec();
  }
  _seeded = true;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function deserializeUser(
  raw: Record<string, unknown> | null | undefined,
): User | undefined {
  if (!raw || Object.keys(raw).length === 0) return undefined;
  return {
    id: String(raw.id),
    name: String(raw.name),
    banned: raw.banned === "1" || raw.banned === 1 || raw.banned === true,
  };
}

function deserializePost(
  raw: Record<string, unknown> | null | undefined,
): Post | undefined {
  if (!raw || Object.keys(raw).length === 0) return undefined;
  const post: Post = {
    id: String(raw.id),
    authorId: String(raw.authorId),
    body: String(raw.body),
    createdAt: String(raw.createdAt),
    status: raw.status as PostStatus,
  };
  if (raw.warning) post.warning = String(raw.warning);
  if (raw.runId) post.runId = String(raw.runId);
  return post;
}

export async function listUsers(): Promise<User[]> {
  await ensureSeed();
  const r = redis();
  const ids = await r.smembers(KEY_USERS_INDEX);
  if (ids.length === 0) return [];
  const p = r.pipeline();
  for (const id of ids) p.hgetall(userKey(id));
  const results = (await p.exec()) as (Record<string, unknown> | null)[];
  return results
    .map(deserializeUser)
    .filter((u): u is User => Boolean(u))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function getUser(id: string): Promise<User | undefined> {
  const raw = await redis().hgetall<Record<string, unknown>>(userKey(id));
  return deserializeUser(raw);
}

export async function ensureUser(id: string, name?: string): Promise<User> {
  const existing = await getUser(id);
  if (existing) return existing;
  const u: User = { id, name: name ?? id, banned: false };
  const r = redis();
  const p = r.pipeline();
  p.hset(userKey(id), { id: u.id, name: u.name, banned: "0" });
  p.sadd(KEY_USERS_INDEX, id);
  await p.exec();
  return u;
}

export async function setBanned(
  userId: string,
  banned: boolean,
): Promise<void> {
  // Atomic single-field write , no read-modify-write race.
  await redis().hset(userKey(userId), { banned: banned ? "1" : "0" });
}

export async function createPost(input: {
  authorId: string;
  body: string;
}): Promise<Post> {
  // New posts start `under_review` so <AgentStream> mounts on the very first
  // render and subscribes to the run's stream , otherwise we'd race the
  // workflow's first step and miss the early tool calls.
  const post: Post = {
    id: uid("p"),
    authorId: input.authorId,
    body: input.body,
    createdAt: new Date().toISOString(),
    status: "under_review",
  };
  const r = redis();
  const p = r.pipeline();
  p.hset(postKey(post.id), {
    id: post.id,
    authorId: post.authorId,
    body: post.body,
    createdAt: post.createdAt,
    status: post.status,
  });
  p.sadd(KEY_POSTS_INDEX, post.id);
  await p.exec();
  return post;
}

export async function getPost(id: string): Promise<Post | undefined> {
  const raw = await redis().hgetall<Record<string, unknown>>(postKey(id));
  return deserializePost(raw);
}

export async function listPosts(): Promise<Post[]> {
  const r = redis();
  const ids = await r.smembers(KEY_POSTS_INDEX);
  if (ids.length === 0) return [];
  const p = r.pipeline();
  for (const id of ids) p.hgetall(postKey(id));
  const results = (await p.exec()) as (Record<string, unknown> | null)[];
  return results
    .map(deserializePost)
    .filter((post): post is Post => Boolean(post))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setPostStatus(
  id: string,
  status: PostStatus,
  warning?: string,
): Promise<void> {
  // Atomic single-field write. setPostStatus and setPostRunId target
  // different fields in the same hash, so they no longer race.
  const fields: Record<string, string> = { status };
  if (warning !== undefined) fields.warning = warning;
  await redis().hset(postKey(id), fields);
}

export async function setPostRunId(id: string, runId: string): Promise<void> {
  await redis().hset(postKey(id), { runId });
}

export async function appendAudit(
  entry: Omit<AuditEntry, "id" | "at">,
): Promise<AuditEntry> {
  const e: AuditEntry = {
    ...entry,
    id: uid("a"),
    at: new Date().toISOString(),
  };
  await redis().lpush(auditKey(entry.postId), e);
  return e;
}

export async function getAuditForPost(postId: string): Promise<AuditEntry[]> {
  const entries = await redis().lrange<AuditEntry>(auditKey(postId), 0, -1);
  // LPUSH stores newest first; reverse so the UI reads oldest → newest.
  return entries.reverse();
}

export async function clearAllPosts(): Promise<{ cleared: number }> {
  const r = redis();
  const ids = await r.smembers(KEY_POSTS_INDEX);
  if (ids.length > 0) {
    const keys = [...ids.map(postKey), ...ids.map(auditKey)];
    const p = r.pipeline();
    p.del(...(keys as [string, ...string[]]));
    p.del(KEY_POSTS_INDEX);
    await p.exec();
  }
  // Reset bans so the demo starts clean. In-flight workflows targeting
  // cleared posts will short-circuit (loadPost returns null,
  // executeAction no-ops).
  const userIds = await r.smembers(KEY_USERS_INDEX);
  if (userIds.length > 0) {
    const p = r.pipeline();
    for (const id of userIds) p.hset(userKey(id), { banned: "0" });
    await p.exec();
  }
  return { cleared: ids.length };
}
