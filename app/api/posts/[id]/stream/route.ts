import { consumeStream, createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";

import { getPost } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const post = await getPost(id);
  if (!post?.runId) {
    return new Response("post has no active run", { status: 404 });
  }

  const run = getRun(post.runId);
  return createUIMessageStreamResponse({
    stream: run.getReadable(),
    consumeSseStream: async ({ stream }) => {
      try {
        await consumeStream({ stream });
      } catch (error) {
        if (!isAbortLikeError(error)) {
          console.error("Failed to consume post stream", error);
        }
      }
    },
  });
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "ResponseAborted";
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "ResponseAborted")
  );
}
