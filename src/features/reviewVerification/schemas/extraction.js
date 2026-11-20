import { z } from 'zod';

/** What the vision model reads off the review screenshot. */
const ExtractionSchema = z.object({
  isReviewScreenshot: z
    .boolean()
    .describe('True only for a screenshot of a posted customer review'),
  platform: z
    .enum(['google_maps', 'salla', 'instagram', 'x', 'tiktok', 'snapchat', 'other', 'unknown'])
    .describe('Where the review is posted'),
  businessName: z.string().nullable().describe('Business/place the review is for, as written'),
  reviewerName: z.string().nullable().describe('Display name of the person who wrote the review'),
  rating: z.number().int().min(1).max(5).nullable().describe('Star rating, null if none shown'),
  reviewText: z
    .string()
    .nullable()
    .describe('Full review text exactly as shown, original language'),
  language: z.enum(['ar', 'en', 'mixed', 'other', 'none']),
  postedRelative: z
    .string()
    .nullable()
    .describe('Posting time exactly as shown, e.g. "منذ يومين", "2 days ago", "a week ago"'),
  postedAgeDays: z
    .number()
    .min(0)
    .nullable()
    .describe('postedRelative converted to days before the screenshot was taken; null if unknown'),
  reviewState: z
    .enum(['published', 'draft', 'unknown'])
    .describe('draft = the compose/edit screen with a Post or Publish button, not a posted review'),
  editingSuspected: z
    .boolean()
    .describe(
      'True if the screenshot looks edited: mismatched fonts, misaligned or pasted text, broken UI',
    ),
  editingNotes: z
    .string()
    .nullable()
    .describe('What looks edited, short, English; null if nothing'),
  confidence: z.number().min(0).max(1).describe('How sure you are of the fields above'),
});

export { ExtractionSchema };
