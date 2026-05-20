export function buildUser(data: any = {}) {
  return {
    id: data.id || 'test-id',
    email: data.email || 'test@example.com',
    username: data.username || 'testuser',
    discriminator: data.discriminator || '1234',
    password_hash: data.password_hash || 'hashed',
    date_of_birth: data.date_of_birth || new Date('2000-01-01'),
    ...data,
  };
}
