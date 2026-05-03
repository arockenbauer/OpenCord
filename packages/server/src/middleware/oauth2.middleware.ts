import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import * as oauth2Service from '../services/oauth2.service.js';

// Étendre l'interface Request pour inclure oauth2
declare global {
  namespace Express {
    interface Request {
      oauth2?: {
        applicationId: string;
        userId?: string;
        scopes: string[];
        application: any;
        user?: any;
      };
    }
  }
}

export async function authenticateOAuth2(req: Request, res: Response, next: NextFunction) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new AppError(401, 'INVALID_TOKEN', 'Bearer token required');
    }

    const accessToken = authorization.slice(7);

    // Trouver le token correspondant
    const tokens = await prisma.oAuth2AccessToken.findMany({
      include: { app: true, user: true },
    });

    let matchedToken = null;
    for (const t of tokens) {
      if (await bcrypt.compare(accessToken, t.token)) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token');
    }

    // Vérifier l'expiration
    if (matchedToken.expires_at < new Date()) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Token expired');
    }

    // Stocker les infos OAuth2 dans req.oauth2
    req.oauth2 = {
      applicationId: matchedToken.app_id,
      userId: matchedToken.user_id || undefined,
      scopes: oauth2Service.parseJsonField(matchedToken.scopes),
      application: matchedToken.application,
      user: matchedToken.user || undefined,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// Middleware pour vérifier un scope spécifique
export function requireScope(requiredScope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.oauth2) {
      return next(new AppError(401, 'INVALID_TOKEN', 'Bearer token required'));
    }

    if (!req.oauth2.scopes.includes(requiredScope)) {
      return next(new AppError(403, 'INSUFFICIENT_SCOPE', `Missing required scope: ${requiredScope}`));
    }

    next();
  };
}

// Middleware pour vérifier plusieurs scopes (tous requis)
export function requireScopes(requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.oauth2) {
      return next(new AppError(401, 'INVALID_TOKEN', 'Bearer token required'));
    }

    const missing = requiredScopes.filter(s => !req.oauth2!.scopes.includes(s));
    if (missing.length > 0) {
      return next(new AppError(403, 'INSUFFICIENT_SCOPE', `Missing required scopes: ${missing.join(', ')}`));
    }

    next();
  };
}
