import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const list = (s) =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4100),
    SERVICE_TOKEN: z.string().min(32),

    DATABASE_URL: z.string().url(),

    LEGEND_DELIVERY_URL: z.string().url(),
    LEGEND_DELIVERY_TOKEN: z.string().min(32),

    LLM_PROVIDER: z.enum(['minimax', 'anthropic']).default('minimax'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
    ANTHROPIC_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
    MINIMAX_API_KEY: z.string().optional(),
    MINIMAX_BASE_URL: z.string().url().default('https://api.minimax.io/v1'),
    MINIMAX_MODEL: z.string().default('MiniMax-M3.1-Flash'),
    MINIMAX_REASONING_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),

    EMBEDDINGS_PROVIDER: z.enum(['local', 'voyage']).default('local'),
    LOCAL_EMBEDDING_MODEL: z.string().default('Xenova/multilingual-e5-small'),
    VOYAGE_API_KEY: z.string().optional(),
    VOYAGE_MODEL: z.string().default('voyage-3.5'),
    EMBEDDING_DIM: z.coerce.number().int().positive().default(384),

    BUSINESS_NAMES: z.string().transform(list).pipe(z.array(z.string()).min(1)),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    PHASH_MAX_DISTANCE: z.coerce.number().int().min(0).max(64).default(6),
    // Tuned for multilingual-e5-small, whose scores sit in a high band (unrelated ~0.83).
    TEXT_SIMILARITY_REVIEW: z.coerce.number().min(0).max(1).default(0.95),
    TEXT_SIMILARITY_REJECT: z.coerce.number().min(0).max(1).default(0.985),
    // The review must be posted, and sent, within this many hours of the delivery.
    REVIEW_WINDOW_HOURS: z.coerce.number().positive().default(48),
  })
  .superRefine((env, ctx) => {
    const need = (key) => {
      if (!env[key])
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `required with the selected provider`,
        });
    };
    if (env.LLM_PROVIDER === 'anthropic') need('ANTHROPIC_API_KEY');
    if (env.LLM_PROVIDER === 'minimax') need('MINIMAX_API_KEY');
    if (env.EMBEDDINGS_PROVIDER === 'voyage') need('VOYAGE_API_KEY');
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Names only: never print values, they may be secrets.
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(`Invalid environment:\n${lines.join('\n')}`);
  process.exit(1);
}

export default Object.freeze(parsed.data);
