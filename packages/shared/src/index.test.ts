import { describe, expect, it } from 'vitest';
import {
  GatewayEvents,
  LIMITS,
  PERMISSION_BITS,
  generateSnowflake,
  hasPermission,
  snowflakeToDate,
  computeBasePermissions,
  computeChannelPermissions,
  createGuildSchema,
  updateGuildSchema,
  deleteGuildSchema,
  createChannelSchema,
  updateChannelSchema,
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  twoFactorEnableSchema,
  twoFactorVerifySchema,
  twoFactorLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateUserSchema,
  deleteUserSchema,
  createMessageSchema,
  editMessageSchema,
  bulkDeleteSchema,
  getMessagesSchema,
  searchMessagesSchema,
  createRoleSchema,
  updateRoleSchema,
  updateRolePositionsSchema,
  updateMemberSchema,
  createInviteSchema,
  createRelationshipSchema,
  createDMSchema,
  banUserSchema,
  autoModRuleSchema,
} from './index';

describe('shared package index exports', () => {
  it('re-exports the main constants and helpers', () => {
    expect(GatewayEvents.READY).toBe('READY');
    expect(LIMITS.MAX_MESSAGE_LENGTH).toBe(2000);
    expect(hasPermission(PERMISSION_BITS.ADMINISTRATOR, PERMISSION_BITS.BAN_MEMBERS)).toBe(true);
  });

  it('re-exports snowflake helpers', () => {
    const id = generateSnowflake();
    expect(typeof id).toBe('string');
    expect(snowflakeToDate(id)).toBeInstanceOf(Date);
  });

  it('re-exports permission helpers', () => {
    expect(typeof computeBasePermissions).toBe('function');
    expect(typeof computeChannelPermissions).toBe('function');
  });

  it('re-exports guild validators', () => {
    expect(typeof createGuildSchema.parse).toBe('function');
    expect(typeof updateGuildSchema.parse).toBe('function');
    expect(typeof deleteGuildSchema.parse).toBe('function');
    expect(typeof createChannelSchema.parse).toBe('function');
    expect(typeof updateChannelSchema.parse).toBe('function');
  });

  it('re-exports auth validators', () => {
    expect(typeof registerSchema.parse).toBe('function');
    expect(typeof loginSchema.parse).toBe('function');
    expect(typeof refreshSchema.parse).toBe('function');
    expect(typeof logoutSchema.parse).toBe('function');
    expect(typeof twoFactorEnableSchema.parse).toBe('function');
    expect(typeof twoFactorVerifySchema.parse).toBe('function');
    expect(typeof twoFactorLoginSchema.parse).toBe('function');
    expect(typeof forgotPasswordSchema.parse).toBe('function');
    expect(typeof resetPasswordSchema.parse).toBe('function');
    expect(typeof changePasswordSchema.parse).toBe('function');
  });

  it('re-exports user validators', () => {
    expect(typeof updateUserSchema.parse).toBe('function');
    expect(typeof deleteUserSchema.parse).toBe('function');
  });

  it('re-exports message validators', () => {
    expect(typeof createMessageSchema.parse).toBe('function');
    expect(typeof editMessageSchema.parse).toBe('function');
    expect(typeof bulkDeleteSchema.parse).toBe('function');
    expect(typeof getMessagesSchema.parse).toBe('function');
    expect(typeof searchMessagesSchema.parse).toBe('function');
  });

  it('re-exports role validators', () => {
    expect(typeof createRoleSchema.parse).toBe('function');
    expect(typeof updateRoleSchema.parse).toBe('function');
    expect(typeof updateRolePositionsSchema.parse).toBe('function');
    expect(typeof updateMemberSchema.parse).toBe('function');
  });

  it('re-exports invite and relationship validators', () => {
    expect(typeof createInviteSchema.parse).toBe('function');
    expect(typeof createRelationshipSchema.parse).toBe('function');
    expect(typeof createDMSchema.parse).toBe('function');
    expect(typeof banUserSchema.parse).toBe('function');
    expect(typeof autoModRuleSchema.parse).toBe('function');
  });
});
