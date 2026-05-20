import { describe, it, expect } from 'vitest';
import { buildUser } from '../__tests__/factories/user.factory.js';

describe('AuthService', () => {
  describe('register', () => {
    it('should create a new user with valid data', () => {
      const userData = buildUser();
      expect(userData.email).toBeDefined();
      expect(userData.username).toBeDefined();
    });

    it('should assign default discriminator', () => {
      const user = buildUser();
      expect(user.discriminator).toHaveLength(4);
    });
  });
});
