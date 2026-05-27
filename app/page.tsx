import { getAuditForPost, listPosts, listUsers } from "@/lib/db";
import { AgentStream } from "./agent-stream";
import { clearForum, submitPost } from "./actions";

export const dynamic = "force-dynamic";

const statusTone = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  under_review: "border-blue-200 bg-blue-50 text-blue-700",
  hidden: "border-red-200 bg-red-50 text-red-700",
  warned: "border-amber-200 bg-amber-50 text-amber-700",
  hidden_and_warned: "border-red-200 bg-red-50 text-red-700",
} as const;

export default async function Home() {
  const [users, posts] = await Promise.all([listUsers(), listPosts()]);
  const auditByPost = Object.fromEntries(
    await Promise.all(
      posts.map(
        async (post) => [post.id, await getAuditForPost(post.id)] as const,
      ),
    ),
  );

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10 text-neutral-950">
      <div className="mx-auto grid max-w-3xl gap-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-neutral-500">Review Desk</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Moderate forum posts with the AI SDK
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600">
            Submit a post, run AI SDK triage, and persist the moderation state
            in Redis.
          </p>
        </header>

        <form
          action={submitPost}
          className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-neutral-700">
              Author
              <select
                name="authorId"
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-700">
              Post
              <textarea
                name="body"
                rows={4}
                className="resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 w-fit items-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Submit for moderation
            </button>
          </div>
        </form>

        <section className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Posts</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {posts.length} {posts.length === 1 ? "post" : "posts"}
              </p>
            </div>
            <form action={clearForum}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50"
                disabled={posts.length === 0}
              >
                Clear forum
              </button>
            </form>
          </div>

          {posts.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-neutral-700">
                No posts yet
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                Submit a safe, obvious, or borderline post to test the agent.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-neutral-200">
              {posts.map((post) => {
                const audit = auditByPost[post.id] ?? [];

                return (
                  <li key={post.id} className="px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="max-w-2xl text-sm leading-6 text-neutral-800">
                        {post.body}
                      </p>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          statusTone[post.status]
                        }`}
                      >
                        {post.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    {post.status === "under_review" && post.runId ? (
                      <AgentStream postId={post.id} />
                    ) : null}

                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium text-neutral-700">
                        Audit log
                      </summary>
                      {audit.length === 0 ? (
                        <p className="mt-2 text-sm text-neutral-500">
                          No audit entries yet.
                        </p>
                      ) : (
                        <ol className="mt-3 grid gap-2">
                          {audit.map((entry) => (
                            <li
                              key={entry.id}
                              className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                            >
                              <span className="font-medium">
                                {entry.action}
                              </span>
                              <span className="text-neutral-500"> by </span>
                              <span>{entry.actorId}</span>
                              {entry.note ? (
                                <span className="text-neutral-500">
                                  {" "}
                                  · {entry.note}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      )}
                    </details>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
