import { runTriage } from "@/lib/triage-agent";

const decisionTone = {
  safe: "border-emerald-200 bg-emerald-50 text-emerald-700",
  auto_hide: "border-amber-200 bg-amber-50 text-amber-700",
  auto_warn: "border-amber-200 bg-amber-50 text-amber-700",
  request_ban: "border-red-200 bg-red-50 text-red-700",
  second_opinion: "border-blue-200 bg-blue-50 text-blue-700",
} as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ authorId?: string; body?: string }>;
}) {
  const params = await searchParams;
  const body = params.body?.trim() ?? "";
  const authorId = params.authorId?.trim() || "u_preview";
  const triage = body ? await runTriage({ authorId, body }) : undefined;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10 text-neutral-950">
      <div className="mx-auto grid max-w-3xl gap-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-neutral-500">Review Desk</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Preview a moderation decision
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600">
            Paste a forum post and the AI SDK triage agent will return the
            structured decision the workflow will use later.
          </p>
        </header>

        <form className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-neutral-700">
              Author ID
              <input
                name="authorId"
                defaultValue={authorId}
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-700">
              Post
              <textarea
                name="body"
                defaultValue={body}
                rows={5}
                className="resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 w-fit items-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Preview triage
            </button>
          </div>
        </form>

        {triage ? (
          <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Agent decision</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Confidence {(triage.confidence * 100).toFixed(0)}%
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  decisionTone[triage.decision]
                }`}
              >
                {triage.decision.replaceAll("_", " ")}
              </span>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-neutral-50 p-3">
                <dt className="text-xs font-medium uppercase text-neutral-500">
                  Severity
                </dt>
                <dd className="mt-1 text-sm font-medium">{triage.severity}</dd>
              </div>
              <div className="rounded-md bg-neutral-50 p-3">
                <dt className="text-xs font-medium uppercase text-neutral-500">
                  Category
                </dt>
                <dd className="mt-1 text-sm font-medium">{triage.category}</dd>
              </div>
              <div className="rounded-md bg-neutral-50 p-3">
                <dt className="text-xs font-medium uppercase text-neutral-500">
                  Next step
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {triage.humanRequest ? "Ask moderator" : "Apply decision"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 rounded-md border border-neutral-200 p-4">
              <p className="text-xs font-medium uppercase text-neutral-500">
                Reasoning
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-700">
                {triage.reasoning}
              </p>
            </div>

            {triage.humanRequest ? (
              <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-medium uppercase text-blue-700">
                  Moderator question
                </p>
                <p className="mt-2 text-sm leading-6 text-blue-950">
                  {triage.humanRequest}
                </p>
              </div>
            ) : null}

            {triage.actionOptions?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {triage.actionOptions.map((option) => (
                  <span
                    key={option.action}
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700"
                  >
                    {option.label}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
