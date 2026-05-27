"use server";

import { revalidatePath } from "next/cache";
import { start } from "workflow/api";

import { clearAllPosts, createPost, ensureUser, setPostRunId } from "@/lib/db";
import { triagePostWorkflow } from "@/workflows/triage";

export async function submitPost(formData: FormData): Promise<void> {
  const authorId = String(formData.get("authorId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!authorId || !body) return;

  await ensureUser(authorId);
  const post = await createPost({ authorId, body });
  const run = await start(triagePostWorkflow, [post.id]);
  await setPostRunId(post.id, run.runId);

  revalidatePath("/");
}

export async function clearForum(): Promise<void> {
  await clearAllPosts();
  revalidatePath("/");
}
