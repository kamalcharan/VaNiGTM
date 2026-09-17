import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // agent-core was outside the roots, so the event bus, the runner and the
  // LLM client — the heart of the product — had no test the runner could even
  // find. A diagnostic bug in llm.client cost two investigations before that
  // was noticed.
  // src/tests covers what sits directly in src/ — server.ts today.
  //
  // src/auth, src/onboarding, src/vani and src/vara were added 2026-09-17,
  // when the note that used to sit here ("worth widening when something in
  // them earns a test") came true: embed_origins is an allowlist that decides
  // which sites may carry a token naming the tenant, and its normaliser was
  // unfindable by the runner. A test that cannot be run is not a test, and the
  // silence is indistinguishable from passing — `jest src/onboarding` printed
  // "0 matches" and exited 1, which reads like a config error rather than the
  // whole directory being invisible.
  roots: [
    '<rootDir>/src/skills', '<rootDir>/src/services', '<rootDir>/src/etl',
    '<rootDir>/src/agent-core', '<rootDir>/src/tests',
    '<rootDir>/src/auth', '<rootDir>/src/onboarding',
    '<rootDir>/src/vani', '<rootDir>/src/vara',
  ],
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: { ignoreCodes: [151002] } }],
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/skills/**/functions/**/*.ts',
    'src/services/skill-registry.ts',
    'src/services/skill-loader.ts',
    '!src/skills/**/tests/**',
  ],
};

export default config;
