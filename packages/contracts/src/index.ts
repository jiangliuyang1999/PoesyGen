import { z } from 'zod';

const preferredRhymeGroupSchema = z.union([
  z.string().trim().min(1),
  z
    .record(z.string().min(1), z.string().trim().min(1))
    .refine((groups) => Object.keys(groups).length <= 20, {
      message: 'At most 20 rhyme labels may be assigned',
    }),
]);

export const generationRequestSchema = z.object({
  patternId: z.string().min(1),
  theme: z.string().trim().min(1).max(2_000),
  preferredRhymeGroup: preferredRhymeGroupSchema.optional(),
  additionalRequirements: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  maxRounds: z.int().min(1).max(20).default(8),
});

export type GenerationRequestDto = z.infer<typeof generationRequestSchema>;

export const textSelectionSchema = z
  .object({
    lineId: z.string().min(1),
    start: z.int().min(0),
    end: z.int().min(0),
    instruction: z.string().trim().min(1).max(1_000),
  })
  .refine(({ start, end }) => end > start, {
    message: 'Selection end must be greater than start',
    path: ['end'],
  });

export const refinementRequestSchema = z.object({
  patternId: z.string().min(1),
  theme: z.string().trim().min(1).max(2_000),
  draft: z.object({
    id: z.string().min(1),
    patternId: z.string().min(1),
    theme: z.string().min(1).max(2_000),
    lines: z
      .array(
        z.object({
          id: z.string().min(1),
          text: z.string().min(1).max(500),
        }),
      )
      .min(1)
      .max(100)
      .refine((lines) => new Set(lines.map(({ id }) => id)).size === lines.length, {
        message: 'Draft line IDs must be unique',
      }),
    version: z.int().min(1),
    title: z.string().max(200).optional(),
    requestedRhymeGroup: z.string().optional(),
  }),
  selections: z.array(textSelectionSchema).min(1).max(50),
  preferredRhymeGroup: preferredRhymeGroupSchema.optional(),
  additionalRequirements: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  maxRounds: z.int().min(1).max(20).default(8),
});

export type RefinementRequestDto = z.infer<typeof refinementRequestSchema>;

export const checkProsodyRequestSchema = z.object({
  patternId: z.string().min(1),
  expectedRhymeGroup: z.string().trim().min(1).optional(),
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

export type CheckProsodyRequestDto = z.infer<typeof checkProsodyRequestSchema>;
