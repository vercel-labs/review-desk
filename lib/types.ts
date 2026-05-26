import { z } from "zod";

export const ACTION_IDS = [
  "restore",
  "hide",
  "warn",
  "hide_and_warn",
  "ban",
  "dismiss",
] as const;

export const ActionIdSchema = z.enum(ACTION_IDS);
export type ActionId = z.infer<typeof ActionIdSchema>;

// Slack action_ids and the workflow hook token share a single namespace so the
// producer (postModCard) and consumer (bot.onAction → resumeHook) can never
// drift. `mod_decision:<postId>` is the hook token; `mod_decision:<action>`
// is the action_id on each Slack button.
const NAMESPACE = "mod_decision";

export function hookTokenForPost(postId: string): string {
  return `${NAMESPACE}:${postId}`;
}

export function actionIdFor(action: ActionId): string {
  return `${NAMESPACE}:${action}`;
}

export const ALL_MOD_ACTION_IDS: readonly string[] =
  ACTION_IDS.map(actionIdFor);

export const POST_STATUSES = [
  "live",
  "under_review",
  "hidden",
  "warned",
  "hidden_and_warned",
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export type User = {
  id: string;
  name: string;
  banned: boolean;
};

export type Post = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  status: PostStatus;
  warning?: string;
  // Workflow run ID assigned at start(). Lets the UI subscribe to the agent's
  // resumable token stream via /api/posts/<id>/stream.
  runId?: string;
};

export type AuditEntry = {
  id: string;
  postId: string;
  at: string;
  action: ActionId | "auto_classified" | "escalated";
  actorId: string;
  note?: string;
};

export const TriageSchema = z
  .object({
    category: z
      .enum([
        "spam",
        "harassment",
        "hate_speech",
        "self_harm",
        "off_topic",
        "benign",
        "other",
      ])
      .describe("Best-fit category for the post."),
    severity: z
      .enum(["none", "low", "medium", "high"])
      .describe("How severe the violation is, if any."),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("How confident the agent is in its decision (0-1)."),
    decision: z
      .enum(["safe", "auto_hide", "auto_warn", "request_ban", "second_opinion"])
      .describe(
        "Routing decision. 'safe' leaves the post live. 'auto_hide' / 'auto_warn' are taken without a human. 'request_ban' / 'second_opinion' escalate to a moderator.",
      ),
    reasoning: z
      .string()
      .describe(
        "Short explanation of the decision, surfaced in the mod card and audit log.",
      ),
    draftedWarning: z
      .string()
      .optional()
      .describe(
        "When decision involves warning the user (auto_warn, or any escalation that includes warn / hide_and_warn options), the message to DM them. REQUIRED when decision is auto_warn.",
      ),
    humanRequest: z
      .string()
      .optional()
      .describe(
        "When escalating, the prose question to ask the moderator. REQUIRED when decision is request_ban or second_opinion.",
      ),
    actionOptions: z
      .array(
        z.object({
          label: z.string().describe("Button label shown in Slack."),
          action: ActionIdSchema.describe(
            "Action to apply if the moderator clicks this button.",
          ),
        }),
      )
      .optional()
      .describe(
        "Buttons to render on the mod card. The agent picks a relevant subset of the action vocabulary. REQUIRED when escalating.",
      ),
  })
  // Cross-field invariants the model must respect. The workflow only routes
  // after a schema-valid `submitTriage` call, so invalid tool input should be
  // handled explicitly if you adapt this schema for production.
  .superRefine((v, ctx) => {
    if (v.decision === "auto_warn" && !v.draftedWarning?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draftedWarning"],
        message: "draftedWarning is required when decision is 'auto_warn'.",
      });
    }
    if (
      (v.decision === "request_ban" || v.decision === "second_opinion") &&
      !v.humanRequest?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["humanRequest"],
        message:
          "humanRequest is required when decision is 'request_ban' or 'second_opinion'.",
      });
    }
  });

export type TriageOutput = z.infer<typeof TriageSchema>;
