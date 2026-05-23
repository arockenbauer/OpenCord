import { describe, expect, it, vi, beforeEach } from 'vitest';
import { logInfo, logError, logWarn, logDebug, logTrace, logFatal } from './logger.js';

describe('logger utils', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logInfo calls logger.info', () => {
    const { pinoLogger } = require('./logger.js');
    const spy = vi.spyOn(pinoLogger, 'info').mockImplementation(() => {});
    logInfo('test message', { key: 'value' });
    expect(spy).toHaveBeenCalledWith({ key: 'value' }, 'test message');
  });

  it('logError calls logger.error', () => {
    const { pinoLogger } = require('./logger.js');
    const spy = vi.spyOn(pinoLogger, 'error').mockImplementation(() => {});
    logError('error message');
    expect(spy).toHaveBeenCalledWith({}, 'error message');
  });

  it('logWarn calls logger.warn', () => {
    const { pinoLogger } = require('./logger.js');
    const spy = vi.spyOn(pinoLogger, 'warn').mockImplementation(() => {});
    logWarn('warn message', { data: 123 });
    expect(spy).toHaveBeenCalledWith({ data: 123 }, 'warn message');
  });

  it('logDebug calls logger.debug', () => {
    const { pinoLogger } = require('./logger.js');
    const spy = vi.spyOn(pinoLogger, 'debug').mockImplementation(() => {});
    logDebug('debug message');
    expect(spy).toHaveBeenCalledWith({}, 'debug message');
  });

  it('logTrace calls logger.trace', () => {
    const { pinoLogger } = require('./logger.js');
    const spy = vi.spyOn(pinoLogger, 'trace').mockImplementation(() => {});
    logTrace('trace message');
    expect(spy).toHaveBeenCalledWith({}, 'trace message');
  });

  it('logFatal calls logger.fatal', () => {
    const { pinoLogger } = require('./logger.js');
    const spy = vi.spyOn(pinoLogger, 'fatal').mockImplementation(() => {});
    logFatal('fatal message', { err: 'boom' });
    expect(spy).toHaveBeenCalledWith({ err: 'boom' }, 'fatal message');
  });
});
