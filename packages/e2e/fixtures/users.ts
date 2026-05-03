import { faker } from '@faker-js/faker';

export function createTestUser(overrides?: Record<string, unknown>) {
  return {
    email: faker.internet.email(),
    username: faker.internet.userName(),
    password: 'Test1234!',
    ...overrides,
  };
}
