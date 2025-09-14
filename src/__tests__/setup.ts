import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external services for testing
jest.mock('../services/gmail.service');
jest.mock('../services/openai.service');
jest.mock('../services/twilio.service');

// Set test timeout
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Global setup for all tests
});

afterAll(async () => {
  // Global cleanup for all tests
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});
