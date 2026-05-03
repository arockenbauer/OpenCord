import pino from 'pino';
import fs from 'fs';
import path from 'path';

const logDir = process.env.LOG_FILE_PATH ? path.dirname(process.env.LOG_FILE_PATH) : './logs';
const logFile = process.env.LOG_FILE_PATH || './logs/opencord.log';
const logEnabled = process.env.LOG_FILE_ENABLED !== 'false';

if (logEnabled && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const streams: any[] = [];

if (logEnabled) {
  streams.push({
    stream: fs.createWriteStream(logFile, { flags: 'a' }),
  });
}

if (process.env.NODE_ENV === 'development') {
  streams.push({
    stream: pino.transport({
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' },
    }),
  });
}

const logger = streams.length > 0
  ? pino(
      {
        level: process.env.LOG_LEVEL || 'info',
        serializers: {
          req: pino.stdSerializers.req,
          res: pino.stdSerializers.res,
          err: pino.stdSerializers.err,
        },
        redact: {
          paths: ['req.headers.authorization', 'password', 'token', 'secret', 'two_factor_secret'],
          censor: '[REDACTED]',
        },
      },
      pino.multistream(streams)
    )
  : pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
      serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
        err: pino.stdSerializers.err,
      },
      redact: {
        paths: ['req.headers.authorization', 'password', 'token', 'secret', 'two_factor_secret'],
        censor: '[REDACTED]',
      },
    });

export function logInfo(message: string, ...args: any[]): void {
  logger.info(args.length > 0 ? { ...args[0] } : {}, message);
}

export function logError(message: string, ...args: any[]): void {
  logger.error(args.length > 0 ? { ...args[0] } : {}, message);
}

export function logWarn(message: string, ...args: any[]): void {
  logger.warn(args.length > 0 ? { ...args[0] } : {}, message);
}

export function logDebug(message: string, ...args: any[]): void {
  logger.debug(args.length > 0 ? { ...args[0] } : {}, message);
}

export function logTrace(message: string, ...args: any[]): void {
  logger.trace(args.length > 0 ? { ...args[0] } : {}, message);
}

export function logFatal(message: string, ...args: any[]): void {
  logger.fatal(args.length > 0 ? { ...args[0] } : {}, message);
}

export const pinoLogger = logger;
