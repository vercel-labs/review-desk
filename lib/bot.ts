import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat, type Author } from "chat";
import { resumeHook } from "workflow/api";

import { ActionIdSchema, ALL_MOD_ACTION_IDS } from "./types";

const adapters = { slack: createSlackAdapter() };

export const bot = new Chat({
  userName: "review-desk",
  adapters,
  state: createMemoryState(),
  logger: "info",
});

bot.onAction([...ALL_MOD_ACTION_IDS], async (event) => {
  if (!event.value) return;

  let parsed: { token: string; action: string };
  try {
    parsed = JSON.parse(event.value) as { token: string; action: string };
  } catch (err) {
    console.error("[slack] failed to parse action value", err);
    return;
  }

  const action = ActionIdSchema.parse(parsed.action);
  const moderator = await getModeratorDisplayName(event.user);

  try {
    await resumeHook(parsed.token, { action, moderator });
  } catch (err) {
    console.warn("[slack] resumeHook rejected", {
      token: parsed.token,
      err,
    });
  }
});

async function getModeratorDisplayName(user: Author): Promise<string> {
  try {
    const profile = await bot.getUser(user);
    const displayName = profile?.userName?.trim();
    if (displayName && displayName !== "unknown") {
      return displayName;
    }
  } catch (err) {
    console.warn("[slack] failed to fetch moderator profile", {
      userId: user.userId,
      err,
    });
  }

  return firstKnownName(user.fullName, user.userName, user.userId);
}

function firstKnownName(...names: string[]): string {
  return names.find((name) => name.trim() && name !== "unknown") ?? "unknown";
}
