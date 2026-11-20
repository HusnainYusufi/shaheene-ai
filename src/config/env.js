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

    LLM_PROVIDER: z.enum(['minimax', 'anthropic']),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
    ANTHROPIC_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
    MINIMAX_API_KEY: z.string().optional(),
    MINIMAX_BASE_URL: z.string().url().default('https://api.minimax.io/v1'),
    MINIMAX_MODEL: z.string().optional(),

    EMBEDDINGS_PROVIDER: z.enum(['voyage']).default('voyage'),
    VOYAGE_API_KEY: z.string().min(1),
    VOYAGE_MODEL: z.string().default('voyage-3.5'),
    EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),

    BUSINESS_NAMES: z.string().transform(list).pipe(z.array(z.string()).min(1)),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    PHASH_MAX_DISTANCE: z.coerce.number().int().min(0).max(64).default(6),
    TEXT_SIMILARITY_REVIEW: z.coerce.number().min(0).max(1).default(0.9),
    TEXT_SIMILARITY_REJECT: z.coerce.number().min(0).max(1).default(0.97),
    MAX_SUBMIT_DELAY_DAYS: z.coerce.number().positive().default(14),
  })
  .superRefine((env, ctx) => {
    const need = (key) => {
      if (!env[key])
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `required when LLM_PROVIDER=${env.LLM_PROVIDER}`,
        });
    };
    if (env.LLM_PROVIDER === 'anthropic') need('ANTHROPIC_API_KEY');
    if (env.LLM_PROVIDER === 'minimax') {
      need('MINIMAX_API_KEY');
      need('MINIMAX_MODEL');
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Names only: never print values, they may be secrets.
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(`Invalid environment:\n${lines.join('\n')}`);
  process.exit(1);
}

export default Object.freeze(parsed.data);
