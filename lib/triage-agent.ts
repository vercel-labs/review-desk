import { ToolLoopAgent, tool, hasToolCall } from "ai";
import { z } from "zod";

import {
  findSimilarReports,
  getAuthorHistory,
  lookupPolicy,
} from "./agent-tools";
import { TriageSchema } from "./types";
import type { TriageOutput } from "./types";

const TRIAGE_MODEL = "anthropic/claude-haiku-4.5";

export const TRIAGE_INSTRUCTIONS = `You are a moderation triage agent for a small online community forum.

You communicate ONLY by calling tools. Never reply in plain text. Every response
must be a tool call. Your final tool call MUST be \`submitTriage\` , the workflow
ignores any text you emit and only reads the \`submitTriage\` arguments.

For every post you see, decide what should happen to it. You have three resolution paths:

1. SAFE , the post is fine, leave it live.
2. AUTO-RESOLVE , clear, unambiguous violation that you can act on without a human:
   - "auto_hide" hides the post.
   - "auto_warn" hides the post and DMs the user a warning.
3. ESCALATE , borderline, ban-worthy, or otherwise needs a human moderator:
   - "second_opinion" , you're unsure or the case is borderline.
   - "request_ban" , you believe a ban is warranted; the human confirms.

Action vocabulary the moderator can choose from:
- restore: post stays live, clears any "under review" badge
- hide: post is hidden, no warning sent
- warn: post stays live, user receives a warning DM
- hide_and_warn: post is hidden AND user receives a warning DM
- ban: user is banned (cosmetically marked across the forum); their posts are dimmed
- dismiss: take no action; close the case

Tools available to you:
- getAuthorHistory(authorId): prior strikes, account age, tone, recent moderation actions on this user
- findSimilarReports(text): up to 3 similar prior cases with their outcomes
- lookupPolicy(category): the relevant community-guideline excerpt

Use the context tools when they meaningfully change your decision. You don't have
to use all of them. A clean account posting obvious spam doesn't need a policy lookup.

When you escalate, you must:
- Set "humanRequest" to a tight, specific question for the moderator (not a generic
  "please review"). Include the key signal that made you uncertain.
- Set "actionOptions" to the relevant subset of the action vocabulary, with human-readable
  labels. For a ban request, that's typically [Approve ban, Just warn, Restore]. For a
  second opinion on a borderline case, [Confirm violation, Restore] is enough. Keep it
  short , 2 to 4 buttons. Always include "dismiss" only if relevant.

When the decision involves a warning ("auto_warn", or any escalation where one of the
options is "warn" / "hide_and_warn"), draft the warning message in "draftedWarning".
Address the user directly, cite which guideline, keep it under 3 sentences.

Always include a one-or-two-sentence "reasoning" explaining your decision.

FINALIZATION: As soon as you have enough context , even on the very first turn for
clearly safe posts like a greeting , call \`submitTriage\` with the complete decision.
Do not narrate, do not summarize, do not output text. The submitTriage call is your
ONLY way to finish; the workflow stops listening once it lands.`;

export async function runTriage({
  authorId,
  body,
}: {
  authorId: string;
  body: string;
}): Promise<TriageOutput | undefined> {
  const agent = new ToolLoopAgent({
    model: TRIAGE_MODEL,
    instructions: TRIAGE_INSTRUCTIONS,
    tools: {
      getAuthorHistory: tool({
        description:
          "Look up the author's moderation history: account age, prior strikes, recent actions, overall tone.",
        inputSchema: z.object({
          authorId: z
            .string()
            .describe("Internal user ID of the post's author."),
        }),
        execute: getAuthorHistory,
      }),
      findSimilarReports: tool({
        description:
          "Find up to 3 prior moderation cases similar to the post, with their outcomes.",
        inputSchema: z.object({
          text: z.string().describe("The post body to find similar cases for."),
        }),
        execute: findSimilarReports,
      }),
      lookupPolicy: tool({
        description: "Look up the community-guidelines section for a category.",
        inputSchema: z.object({
          category: z
            .string()
            .describe(
              "Category like 'harassment', 'spam', 'hate_speech', 'self_harm', 'off_topic'.",
            ),
        }),
        execute: lookupPolicy,
      }),
      submitTriage: tool({
        description:
          "Submit your final triage decision. This is your last action, call it " +
          "exactly once, with the complete triage object. After this call the app " +
          "will route the post (auto-resolve or escalate to a human moderator).",
        inputSchema: TriageSchema,
        execute: async (triage: TriageOutput) => {
          // Identity tool. The model's input is the triage decision.
          return triage;
        },
      }),
    },
    stopWhen: hasToolCall("submitTriage"),
  });

  const result = await agent.generate({
    prompt:
      `Triage this forum post.\n\n` +
      `Author ID: ${authorId}\n` +
      `Body:\n"""\n${body}\n"""`,
  });

  const submitCall = result.steps
    .flatMap((step) => step.toolCalls)
    .find((call) => call.toolName === "submitTriage");

  return submitCall?.input as TriageOutput | undefined;
}
