import { z } from "zod";

export const styleProfileSchema = z
  .object({
    style_name: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    experience_level: z.string().max(50).optional(),
    dimension_scores: z.record(z.string().max(50), z.number()).optional(),
    strengths: z.array(z.string().max(300)).max(20).optional(),
    growth_areas: z
      .array(
        z.object({
          dimension: z.string().max(100),
          advice: z.string().max(500),
        })
      )
      .max(10)
      .optional(),
    matched_fighters: z
      .array(
        z.object({
          name: z.string().max(100),
          slug: z.string().max(100).optional(),
          overlappingDimensions: z.array(z.string().max(50)).max(8).optional(),
        })
      )
      .max(10)
      .optional(),
    punches_to_master: z.array(z.string().max(100)).max(20).optional(),
    stance_recommendation: z.string().max(200).optional(),
    training_priorities: z.array(z.string().max(300)).max(10).optional(),
    physical_context: z
      .object({
        height: z.string().max(50).optional(),
        build: z.string().max(100).optional(),
        reach: z.string().max(50).optional(),
        stance: z.string().max(50).optional(),
      })
      .optional(),
  })
  .passthrough();

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1)
    .max(100),
  context: z.enum(["technique", "drills", "style"]).optional(),
  styleProfile: styleProfileSchema.optional(),
  thinkLonger: z.boolean().optional(),
  userId: z.string().max(128).optional(),
});

export const clipReviewRequestSchema = z.object({
  frames: z.array(z.string().max(200_000)).min(1).max(60),
  filename: z.string().max(200).optional(),
  userId: z.string().max(128).optional(),
});
