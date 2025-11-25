import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ipeds-dev-secret-change-in-production';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    email: string;
    username: string;
  };
}

// Middleware that requires authentication
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Authentication required' } });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      email: string;
      username: string;
    };

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: { message: 'Token expired', code: 'TOKEN_EXPIRED' } });
    }
    return res.status(401).json({ error: { message: 'Invalid token' } });
  }
}

// Optional auth - attaches user if token present, but doesn't require it
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      email: string;
      username: string;
    };

    req.user = payload;
  } catch {
    // Token invalid, but that's okay for optional auth
  }

  next();
}
