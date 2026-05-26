import { generateText, Output } from "ai";
import { z } from "zod";

const FAST_MODEL = "google/gemini-3-flash";

const AuthorHistorySchema = z.object({
  accountAgeDays: z.number().int().min(0).max(3000),
  totalPosts: z.number().int().min(0).max(5000),
  strikes: z.number().int().min(0).max(5),
  tone: z.enum(["constructive", "mixed", "frequently-hostile"]),
  priorActions: z.array(
    z.object({
      action: z.enum(["warn", "hide", "hide_and_warn", "ban", "restore"]),
      date: z.string().describe("ISO date, within the last 18 months."),
      reason: z.string().describe("One-line reason."),
    }),
  ),
  notes: z
    .string()
    .describe("One-sentence summary a moderator would find useful."),
});

export async function getAuthorHistory({
  authorId,
}: {
  authorId: string;
}): Promise<z.infer<typeof AuthorHistorySchema>> {
  "use step";

  const { output } = await generateText({
    model: FAST_MODEL,
    output: Output.object({
      schema: AuthorHistorySchema,
    }),
    system:
      "You are a stub that simulates a community-moderation database. " +
      "Generate plausible, realistic histories. Vary the data , most users are clean, " +
      "some have one or two strikes, a small number are repeat offenders. Dates should " +
      "fall within the last 18 months relative to today.",
    prompt: `Generate a moderation history for forum user "${authorId}".`,
  });
  return output;
}

const SimilarReportsSchema = z.object({
  results: z
    .array(
      z.object({
        postId: z.string().describe("Fake post ID like p_8421."),
        similarity: z.number().min(0).max(1),
        excerpt: z.string().describe("Short excerpt of the similar post."),
        outcome: z.enum([
          "restore",
          "hide",
          "warn",
          "hide_and_warn",
          "ban",
          "dismiss",
        ]),
        date: z.string().describe("ISO date within the last 6 months."),
      }),
    )
    .max(3),
});

export async function findSimilarReports({
  text,
}: {
  text: string;
}): Promise<z.infer<typeof SimilarReportsSchema>> {
  "use step";

  const { output } = await generateText({
    model: FAST_MODEL,
    output: Output.object({
      schema: SimilarReportsSchema,
    }),
    system:
      "You are a stub that simulates a vector search across recent moderation reports. " +
      "Return 0-3 plausibly-similar prior cases with their outcomes. Sometimes return zero " +
      "results to simulate a novel case.",
    prompt: `Find prior moderation cases similar to: """${text}"""`,
  });
  return output;
}

const PolicySchema = z.object({
  category: z.string(),
  citation: z
    .string()
    .describe("Short citation like 'Community Guidelines §3.1'."),
  text: z.string().describe("2-3 sentence excerpt of the policy."),
});

export async function lookupPolicy({
  category,
}: {
  category: string;
}): Promise<z.infer<typeof PolicySchema>> {
  "use step";

  const { output } = await generateText({
    model: FAST_MODEL,
    output: Output.object({
      schema: PolicySchema,
    }),
    system:
      "You are a stub that simulates lookup against a community guidelines document. " +
      "Return a plausible policy excerpt for the given category.",
    prompt: `Look up the community guideline that covers: ${category}`,
  });
  return output;
}
