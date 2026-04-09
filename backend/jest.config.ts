import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/skills', '<rootDir>/src/services'],
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
