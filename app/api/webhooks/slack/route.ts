import { type NextRequest } from "next/server";

import { bot } from "@/lib/bot";

export async function POST(request: NextRequest): Promise<Response> {
  return bot.webhooks.slack(request);
}
