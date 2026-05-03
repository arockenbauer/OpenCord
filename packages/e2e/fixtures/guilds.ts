import { faker } from '@faker-js/faker';

export function createTestGuild(overrides?: Record<string, unknown>) {
  return {
    name: faker.company.name(),
    ...overrides,
  };
}
