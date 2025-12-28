/**
 * Jest test setup file
 * This file runs before each test file
 */

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-jwt-secret-key-for-testing-only-32chars';
process.env['JWT_REFRESH_SECRET'] = 'test-jwt-refresh-secret-key-for-testing';
process.env['DATABASE_URL'] = 'postgresql://localhost:5432/lidar_forest_test';
process.env['REDIS_HOST'] = 'localhost';
process.env['REDIS_PORT'] = '6379';

// Extend Jest matchers if needed
// import '@testing-library/jest-dom';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

export {};
