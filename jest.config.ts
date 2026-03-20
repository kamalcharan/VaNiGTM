import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/skills', '<rootDir>/shared'],
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: { ignoreCodes: [151002] } }],
  },
  clearMocks: true,
  collectCoverageFrom: [
    'skills/**/functions/**/*.ts',
    'shared/skill-loader.ts',
    'shared/skill-registry.ts',
    '!skills/**/tests/**',
    '!shared/**/tests/**',
  ],
};

export default config;
