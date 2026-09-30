/**
 * The LLM and worker configuration every test runs under, stated in full.
 *
 * Production reads these from .env with no defaults (agent-core/llm.config.ts),
 * so tests must supply them too — explicitly, here, rather than by the code
 * quietly filling gaps. A test that needs a different value sets it itself;
 * a test about a MISSING value deletes it.
 *
 * Only fills what the environment has not already set, so a developer running
 * the suite against a real endpoint still can.
 */
const TEST_LLM_ENV: Record<string, string> = {
  LLM_PRIMARY_URL: 'http://llm.test.invalid/v1',
  LLM_PRIMARY_MODEL: 'test-model',
  LLM_PRIMARY_KEY: '',
  LLM_PRIMARY_TIMEOUT_MS: '60000',
  LLM_PRIMARY_SYSTEM_SUFFIX: '',
  LLM_CONTEXT_TOKENS: '8192',
  LLM_MAX_CONCURRENT: '1',
  LLM_BYOK_MAX_CONCURRENT: '4',
  LLM_CHARS_PER_TOKEN: '3',
  LLM_TOKENS_PER_SEC: '10',
  HAIKU_DEFAULT: 'true',
  LLM_FAILOVER_MODEL: 'claude-test-failover',
  LLM_TEMPLATE_OVERHEAD_TOKENS: '200',
  LLM_BUDGET_SLACK_TOKENS: '64',
  LLM_OVERFLOW_MARGIN: '0.9',
  LLM_CALIBRATION_MIN_SAMPLES: '3',
  LLM_SPEED_MIN_SAMPLE_TOKENS: '50',
  LLM_SPEED_MAX_MULTIPLE: '4',
  LLM_PREFILL_FACTOR: '10',
  LLM_TIMEOUT_SLACK_MS: '15000',
  LLM_DEFAULT_MAX_TOKENS: '1000',
  LLM_DEFAULT_TEMPERATURE: '0.2',
  LLM_EXTRACT_ANSWER_DIVISOR: '8',
  LLM_EXTRACT_ANSWER_MIN: '800',
  LLM_EXTRACT_ANSWER_MAX: '3000',
  WORKER_POLL_MS: '3000',
  WORKER_BATCH_SIZE: '5',
  WORKER_HEARTBEAT_MS: '30000',
  WORKER_STALE_CLAIM_SECONDS: '120',
  WORKER_MAX_ATTEMPTS: '3',
};
for (const [k, v] of Object.entries(TEST_LLM_ENV)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
