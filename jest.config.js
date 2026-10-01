import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Jest is the single runner for the unit and integration suites.
  // The former Vitest suites (test:integration, test:hooks) now run here too,
  // so this config is the one place that defines the test surface.
  testMatch: [
    '<rootDir>/__tests__/**/*.[jt]s?(x)',
    '**/__tests__/**/*.test.[jt]s?(x)',
    '!**/__tests__/**/*.comprehensive.test.ts',
    '!**/__tests__/**/*.edge.test.ts',
  ],
  collectCoverage: true,
  coverageReporters: ['text', 'html'],
  coverageDirectory: './coverage',
  collectCoverageFrom: [
    'src/services/**/*.{js,jsx,ts,tsx}',
    'app/components/Footer.tsx',
    'app/components/Pagination.tsx',
    'app/components/paginationStore.ts',
    'app/components/usePaginationController.ts',
    '!src/services/**/__tests__/**',
    '!src/services/**/types.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
};

// createJestConfig is exported this way to ensure next/jest can load the
// Next.js config which is async
export default createJestConfig(customJestConfig);