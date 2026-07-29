import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // agent-core was outside the roots, so the event bus, the runner and the
  // LLM client — the heart of the product — had no test the runner could even
  // find. A diagnostic bug in llm.client cost two investigations before that
  // was noticed.
  roots: [
    '<rootDir>/src/skills', '<rootDir>/src/services', '<rootDir>/src/etl',
    '<rootDir>/src/agent-core',
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
