import { createSlackAdapter } from "@chat-adapter/slack";
import {
  Actions,
  Button,
  Card,
  CardText,
  Divider,
  Field,
  Fields,
  type CardElement,
} from "chat";

import { appendAudit, getPost, getUser } from "./db";
import { actionIdFor } from "./types";
import type { ActionId, TriageOutput } from "./types";

let slackAdapter: ReturnType<typeof createSlackAdapter> | undefined;

function getSlackAdapter() {
  slackAdapter ??= createSlackAdapter();
  return slackAdapter;
}

export async function postModCard(args: {
  postId: string;
  triage: TriageOutput;
  hookToken: string;
}): Promise<PostedModCard> {
  "use step";

  const channelId = process.env.SLACK_MOD_QUEUE_CHANNEL_ID;
  if (!channelId) throw new Error("SLACK_MOD_QUEUE_CHANNEL_ID is not set");

  const post = await getPost(args.postId);
  if (!post) throw new Error(`Post ${args.postId} not found`);

  const author = await getUser(post.authorId);
  const authorName = author?.name ?? post.authorId;

  const options =
    args.triage.actionOptions && args.triage.actionOptions.length > 0
      ? args.triage.actionOptions
      : defaultOptionsFor(args.triage.decision);

  const reasoning =
    args.triage.reasoning?.trim() || "(agent did not provide reasoning)";
  const question =
    args.triage.humanRequest?.trim() || "This post needs a moderator's call.";
  const body = post.body?.trim() || "(empty post)";

  const snapshot = buildModCardSnapshot(args.postId, authorName, body, {
    ...args.triage,
    reasoning,
    humanRequest: question,
  });

  const card = buildModCard({
    snapshot,
    options,
    hookToken: args.hookToken,
  });
  const fallbackText = `Mod queue · ${args.triage.category} · ${authorName}: ${truncate(body, 140)}`;

  const sent = await getSlackAdapter().postChannelMessage(
    `slack:${channelId}`,
    {
      card,
      fallbackText,
    },
  );

  await appendAudit({
    postId: args.postId,
    action: "escalated",
    actorId: "agent",
    note: question,
  });

  return {
    threadId: getSlackThreadId(channelId, sent.id),
    messageId: sent.id,
    snapshot,
  };
}

// Replace the original card with a resolved version so the buttons cannot be
// clicked again after the workflow advances. The rest of the card stays intact
// so the channel still reads as a moderation log.
export async function markModCardResolved(args: {
  threadId: string;
  messageId: string;
  snapshot: ModCardSnapshot;
  moderator: string;
  action: ActionId;
}): Promise<void> {
  "use step";

  await getSlackAdapter().editMessage(args.threadId, args.messageId, {
    card: buildResolvedModCard(args),
    fallbackText: `Resolved by ${args.moderator} · ${args.action}`,
  });
}

export async function postModThreadReply(args: {
  threadId: string;
  moderator: string;
  action: ActionId;
}): Promise<void> {
  "use step";

  await getSlackAdapter().postMessage(
    args.threadId,
    `✅ ${args.moderator} chose ${args.action}`,
  );
}

function buildModCard(args: {
  snapshot: ModCardSnapshot;
  options: { label: string; action: ActionId }[];
  hookToken: string;
}): CardElement {
  const { snapshot } = args;
  return Card({
    title: `Mod queue · ${snapshot.category}`,
    children: [
      Fields([
        Field({ label: "Post", value: snapshot.postId }),
        Field({ label: "Severity", value: snapshot.severity }),
        Field({ label: "Confidence", value: snapshot.confidence.toFixed(2) }),
        Field({ label: "Decision", value: snapshot.decision }),
      ]),
      CardText(
        `**${snapshot.authorName}** wrote:\n\n${blockquote(snapshot.body)}`,
      ),
      Divider(),
      CardText(`**Agent reasoning**\n${snapshot.reasoning}`),
      CardText(`**Moderator**\n${snapshot.question}`),
      Actions(
        args.options.map((opt) =>
          Button({
            id: actionIdFor(opt.action),
            label: opt.label,
            style: buttonStyleFor(opt.action),
            value: JSON.stringify({
              token: args.hookToken,
              action: opt.action,
            }),
          }),
        ),
      ),
    ],
  });
}

function buildResolvedModCard(args: {
  snapshot: ModCardSnapshot;
  moderator: string;
  action: ActionId;
}): CardElement {
  const { snapshot } = args;
  return Card({
    title: `Mod queue · ${snapshot.category}`,
    children: [
      Fields([
        Field({ label: "Post", value: snapshot.postId }),
        Field({ label: "Severity", value: snapshot.severity }),
        Field({ label: "Confidence", value: snapshot.confidence.toFixed(2) }),
        Field({ label: "Decision", value: snapshot.decision }),
      ]),
      CardText(
        `**${snapshot.authorName}** wrote:\n\n${blockquote(snapshot.body)}`,
      ),
      Divider(),
      CardText(`**Agent reasoning**\n${snapshot.reasoning}`),
      CardText(`**Moderator**\n${snapshot.question}`),
      CardText(`✅ Resolved by **${args.moderator}** · \`${args.action}\``),
    ],
  });
}

function buildModCardSnapshot(
  postId: string,
  authorName: string,
  body: string,
  triage: TriageOutput,
): ModCardSnapshot {
  return {
    postId,
    authorName,
    body,
    category: triage.category,
    severity: triage.severity,
    confidence: triage.confidence,
    decision: triage.decision,
    reasoning: triage.reasoning,
    question: triage.humanRequest ?? "This post needs a moderator's call.",
  };
}

function buttonStyleFor(action: ActionId): "primary" | "danger" | undefined {
  if (action === "ban" || action === "hide" || action === "hide_and_warn") {
    return "danger";
  }
  if (action === "restore" || action === "dismiss") {
    return "primary";
  }
  return undefined;
}

function defaultOptionsFor(
  decision: TriageOutput["decision"],
): { label: string; action: ActionId }[] {
  if (decision === "request_ban") {
    return [
      { label: "Approve ban", action: "ban" },
      { label: "Just warn", action: "hide_and_warn" },
      { label: "Restore", action: "restore" },
    ];
  }
  return [
    { label: "Confirm violation", action: "hide" },
    { label: "Restore", action: "restore" },
    { label: "Dismiss", action: "dismiss" },
  ];
}

function blockquote(s: string): string {
  return s
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function getSlackThreadId(channelId: string, messageTs: string): string {
  return `slack:${channelId}:${messageTs}`;
}

type PostedModCard = {
  threadId: string;
  messageId: string;
  snapshot: ModCardSnapshot;
};

type ModCardSnapshot = {
  postId: string;
  authorName: string;
  body: string;
  category: string;
  severity: string;
  confidence: number;
  decision: TriageOutput["decision"];
  reasoning: string;
  question: string;
};
