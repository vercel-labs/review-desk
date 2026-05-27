import { getWritable } from "workflow";
import { hasToolCall, type UIMessageChunk } from "ai";

import { executeAction } from "@/lib/actions";
import { appendAudit, getPost, setPostStatus } from "@/lib/db";
import { createTriageAgent } from "@/lib/triage-agent";
import type { Post, TriageOutput } from "@/lib/types";

export async function triagePostWorkflow(postId: string): Promise<void> {
  "use workflow";

  await markUnderReview(postId);
  await pingStatusChange(postId);

  const post = await loadPost(postId);
  if (!post) return;

  const triage = await runTriageAgent(post);
  await applyTriageDecision(postId, triage);
}

async function applyTriageDecision(
  postId: string,
  triage: TriageOutput | undefined,
): Promise<void> {
  if (!triage) {
    await setUnderReviewToLive(
      postId,
      "agent did not call submitTriage, workflow could not route post",
    );
    await pingStatusChange(postId);
  } else {
    await recordClassification(postId, triage);
    await pingStatusChange(postId);

    if (triage.decision === "safe") {
      await setStatusStep(postId, "live");
      await pingStatusChange(postId);
    } else if (triage.decision === "auto_hide") {
      await executeAction(postId, "hide", undefined, "agent");
      await pingStatusChange(postId);
    } else if (triage.decision === "auto_warn") {
      const warning = triage.draftedWarning?.trim();
      if (warning) {
        await executeAction(postId, "hide_and_warn", warning, "agent");
      } else {
        await executeAction(postId, "hide", undefined, "agent");
      }
      await pingStatusChange(postId);
    } else {
      await keepUnderReviewForHuman(postId, triage);
      await pingStatusChange(postId);
    }
  }
}

async function runTriageAgent(post: Post): Promise<TriageOutput | undefined> {
  const triageAgent = createTriageAgent();
  const result = await triageAgent.stream({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Triage this forum post.\n\n` +
              `Post ID: ${post.id}\n` +
              `Author ID: ${post.authorId}\n` +
              `Posted at: ${post.createdAt}\n` +
              `Body:\n"""\n${post.body}\n"""\n`,
          },
        ],
      },
    ],
    writable: getWritable<UIMessageChunk>(),
    // Keep the workflow's writable open after the agent finishes so the
    // later workflow steps can still emit chunks to the same stream the client
    // is subscribed to.
    preventClose: true,
    stopWhen: hasToolCall("submitTriage"),
    maxSteps: 6,
    prepareStep: ({ stepNumber }) => {
      // On the last allowed step, force the model to call submitTriage so the
      // workflow always has a routing decision to act on.
      if (stepNumber >= 5) {
        return { toolChoice: { type: "tool", toolName: "submitTriage" } };
      }
      return {};
    },
  });

  // submitTriage may land in any step's tool calls. Scan all steps so we don't
  // miss it if the model emits a trailing text turn after submitting.
  const submitCall = result.steps
    .flatMap((s) => s.toolCalls)
    .find((c) => c.toolName === "submitTriage");

  return submitCall?.input as TriageOutput | undefined;
}

async function keepUnderReviewForHuman(
  postId: string,
  triage: TriageOutput,
): Promise<void> {
  "use step";
  await appendAudit({
    postId,
    action: "escalated",
    actorId: "agent",
    note: triage.humanRequest ?? "needs moderator review",
  });
}

async function loadPost(postId: string) {
  "use step";
  return getPost(postId) ?? null;
}

async function markUnderReview(postId: string) {
  "use step";
  await setPostStatus(postId, "under_review");
}

async function setUnderReviewToLive(postId: string, note: string) {
  "use step";
  await setPostStatus(postId, "live");
  await appendAudit({
    postId,
    action: "auto_classified",
    actorId: "agent",
    note,
  });
}

async function setStatusStep(postId: string, status: "live") {
  "use step";
  await setPostStatus(postId, status);
  await appendAudit({
    postId,
    action: "auto_classified",
    actorId: "agent",
    note: "marked safe",
  });
}

async function recordClassification(postId: string, triage: TriageOutput) {
  "use step";
  await appendAudit({
    postId,
    action: "auto_classified",
    actorId: "agent",
    note:
      `decision=${triage.decision}; ` +
      `category=${triage.category}; ` +
      `severity=${triage.severity}; ` +
      `confidence=${triage.confidence.toFixed(2)}; ` +
      `reasoning=${triage.reasoning}`,
  });
}

// Emit a custom UIMessageChunk on the workflow's writable so the client can
// react to persisted state changes without polling. AgentStream listens for the
// `data-status-change` type and calls `router.refresh()`.
async function pingStatusChange(postId: string) {
  "use step";
  const writable = getWritable<UIMessageChunk>();
  const writer = writable.getWriter();
  try {
    await writer.write({
      type: "data-status-change",
      id: postId,
      data: { ts: Date.now() },
    });
  } finally {
    writer.releaseLock();
  }
}
