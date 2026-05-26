import {
  appendAudit,
  ensureUser,
  getPost,
  setBanned,
  setPostStatus,
} from "./db";
import type { ActionId } from "./types";

// Stub for the cross-platform user-DM integration. In production this would
// route to your transactional email / Slack / push notification provider.
export async function sendWarningToCommunityUser(
  userId: string,
  message: string,
): Promise<void> {
  "use step";
  await ensureUser(userId);
  console.log(`[warn-dm] -> ${userId}: ${message}`);
}

export async function executeAction(
  postId: string,
  action: ActionId,
  draftedWarning: string | undefined,
  actorId: string,
): Promise<void> {
  "use step";

  const post = await getPost(postId);
  if (!post) return;

  switch (action) {
    case "restore":
      await setPostStatus(postId, "live");
      break;
    case "hide":
      await setPostStatus(postId, "hidden");
      break;
    case "warn":
      await setPostStatus(postId, "warned", draftedWarning);
      if (draftedWarning) {
        await sendWarningToCommunityUser(post.authorId, draftedWarning);
      }
      break;
    case "hide_and_warn":
      await setPostStatus(postId, "hidden_and_warned", draftedWarning);
      if (draftedWarning) {
        await sendWarningToCommunityUser(post.authorId, draftedWarning);
      }
      break;
    case "ban":
      await setPostStatus(postId, "hidden");
      await setBanned(post.authorId, true);
      break;
    case "dismiss":
      await setPostStatus(postId, "live");
      break;
  }

  await appendAudit({
    postId,
    action,
    actorId,
    note: draftedWarning,
  });
}
