# Review Desk

Review Desk is a Next.js app for AI-assisted community moderation. It stores demo forum state in Redis, runs a durable triage workflow, and escalates borderline cases to Slack for a human moderator decision.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Freview-desk&env=AI_GATEWAY_API_KEY,SLACK_SIGNING_SECRET,SLACK_MOD_QUEUE_CHANNEL_ID,SLACK_BOT_TOKEN&project-name=review-desk&repository-name=review-desk&integration-ids=oac_V3R1GIpkoJorr6fqyiwdhl17)

> This local checkout does not currently have a Git remote configured. After publishing the project, replace the deploy button's `repository-url` with the real GitHub repository URL.

## Local Development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create a `.env.local` file in the project root. Next.js loads `.env*` files from the root directory and keeps non-`NEXT_PUBLIC_` variables server-side.

```bash
AI_GATEWAY_API_KEY=

KV_REST_API_URL=
KV_REST_API_TOKEN=
REDIS_URL=

SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_MOD_QUEUE_CHANNEL_ID=
```

| Variable                     | Required                                     | Used by                     | Notes                                                                                                                   |
| ---------------------------- | -------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`         | Yes                                          | `@workflow/ai` / AI SDK     | Authenticates model calls for the triage agent. The app currently uses `anthropic/claude-haiku-4.5` through AI Gateway. |
| `KV_REST_API_URL`            | Yes, unless using `UPSTASH_REDIS_REST_URL`   | `@upstash/redis`            | Redis REST URL for forum posts and audit data. Vercel KV/Redis integrations usually provide this automatically.         |
| `KV_REST_API_TOKEN`          | Yes, unless using `UPSTASH_REDIS_REST_TOKEN` | `@upstash/redis`            | Redis REST token. Keep this secret.                                                                                     |
| `REDIS_URL`                  | Yes                                          | `@chat-adapter/state-redis` | Redis connection URL for Chat SDK state, locks, dedupe, and subscriptions. Upstash provides this separately from REST.   |
| `SLACK_BOT_TOKEN`            | Yes                                          | `@chat-adapter/slack`       | Slack bot token, usually starting with `xoxb-`. The bot posts moderation cards and replies.                             |
| `SLACK_SIGNING_SECRET`       | Yes                                          | `@chat-adapter/slack`       | Verifies incoming Slack interactivity webhook requests.                                                                 |
| `SLACK_MOD_QUEUE_CHANNEL_ID` | Yes                                          | `lib/post-mod-card.ts`      | Slack channel ID where escalated moderation cards are posted, for example `C0123456789`.                                |

## Slack Setup

Create a Slack app with a bot token and interactivity enabled.

1. Add the bot to the moderation channel and copy that channel's ID into `SLACK_MOD_QUEUE_CHANNEL_ID`.
2. Set the Slack interactivity request URL to:

```text
https://<your-deployment-domain>/api/webhooks/slack
```

3. Copy the Slack signing secret into `SLACK_SIGNING_SECRET`.
4. Copy the bot token into `SLACK_BOT_TOKEN`.

## Deploying to Vercel

The deploy button pre-prompts for the required AI Gateway, Redis, and Slack variables. You can also configure them manually in Vercel Project Settings.

Recommended Vercel setup:

- Add a Vercel Redis or Upstash Redis integration so Redis REST variables are available.
- Add the Redis connection URL as `REDIS_URL` for Chat SDK state.
- Add `AI_GATEWAY_API_KEY` for model access.
- Add the Slack variables listed above.
- After the first deployment, update the Slack interactivity request URL to the production domain.

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```
