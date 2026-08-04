import { z } from 'zod';

export const generationRequestSchema = z.object({
  patternId: z.string().min(1),
  theme: z.string().trim().min(1).max(2_000),
  preferredRhymeGroup: z
    .union([
      z.string().trim().min(1),
      z
        .record(z.string().min(1), z.string().trim().min(1))
        .refine((groups) => Object.keys(groups).length <= 20, {
          message: 'At most 20 rhyme labels may be assigned',
        }),
    ])
    .optional(),
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
  workVersionId: z.string().min(1),
  selections: z.array(textSelectionSchema).min(1).max(50),
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
