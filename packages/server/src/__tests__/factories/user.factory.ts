import { faker } from '@faker-js/faker';
import type { User } from '@prisma/client';

export function buildUser(overrides?: Partial<User>): Partial<User> {
  return {
    id: faker.string.nanoid(),
    username: faker.internet.userName(),
    email: faker.internet.email(),
    discriminator: faker.string.numeric(4),
    password_hash: '$2b$12$fakehash',
    ...overrides,
  };
}
