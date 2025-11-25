import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db/pool.js';

const router = Router();

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'ipeds-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '15m'; // Access token expires in 15 minutes
const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const SALT_ROUNDS = 12;

// Types
interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  email_verified: boolean;
  is_active: boolean;
}

interface JWTPayload {
  userId: number;
  email: string;
  username: string;
}

// Helper to generate tokens
function generateAccessToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

// Schemas
const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// POST /api/auth/register - Create new user
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, username, password } = RegisterSchema.parse(req.body);

    // Check if email or username already exists
    const existing = await query<{ email: string; username: string }>(
      'SELECT email, username FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );

    if (existing.length > 0) {
      const existingUser = existing[0];
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ error: { message: 'Email already registered' } });
      }
      if (existingUser.username.toLowerCase() === username.toLowerCase()) {
        return res.status(400).json({ error: { message: 'Username already taken' } });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const result = await query<User>(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, email_verified, is_active`,
      [email.toLowerCase(), username, passwordHash]
    );

    const user = result[0];

    // Generate tokens
    const accessToken = generateAccessToken(user as User);
    const refreshToken = generateRefreshToken();

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, refreshToken, expiresAt, req.headers['user-agent'], req.ip]
    );

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { message: error.errors[0].message } });
    }
    next(error);
  }
});

// POST /api/auth/login - Authenticate user
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    // Find user
    const users = await query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(401).json({ error: { message: 'Account is disabled' } });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, refreshToken, expiresAt, req.headers['user-agent'], req.ip]
    );

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { message: error.errors[0].message } });
    }
    next(error);
  }
});

// POST /api/auth/logout - Log out user
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      // Delete the session
      await query('DELETE FROM sessions WHERE refresh_token = $1', [refreshToken]);
    }

    // Clear the cookie
    res.clearCookie('refreshToken');

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: { message: 'No refresh token' } });
    }

    // Find valid session
    const sessions = await query<{ user_id: number; expires_at: Date }>(
      'SELECT user_id, expires_at FROM sessions WHERE refresh_token = $1',
      [refreshToken]
    );

    if (sessions.length === 0) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: { message: 'Invalid refresh token' } });
    }

    const session = sessions[0];

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await query('DELETE FROM sessions WHERE refresh_token = $1', [refreshToken]);
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: { message: 'Refresh token expired' } });
    }

    // Get user
    const users = await query<User>(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [session.user_id]
    );

    if (users.length === 0) {
      await query('DELETE FROM sessions WHERE refresh_token = $1', [refreshToken]);
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: { message: 'User not found or inactive' } });
    }

    const user = users[0];

    // Generate new access token
    const accessToken = generateAccessToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me - Get current user
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const token = authHeader.substring(7);

    try {
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

      // Get fresh user data
      const users = await query<User>(
        'SELECT id, email, username, email_verified, is_active FROM users WHERE id = $1',
        [payload.userId]
      );

      if (users.length === 0 || !users[0].is_active) {
        return res.status(401).json({ error: { message: 'User not found or inactive' } });
      }

      const user = users[0];
      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
      });
    } catch {
      return res.status(401).json({ error: { message: 'Invalid token' } });
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = ForgotPasswordSchema.parse(req.body);

    // Always return success to prevent email enumeration
    const successResponse = { message: 'If an account exists with this email, a password reset link has been sent' };

    // Find user
    const users = await query<User>(
      'SELECT id, email FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      return res.json(successResponse);
    }

    const user = users[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token valid for 1 hour

    // Store token
    await query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, resetToken, expiresAt]
    );

    // In production, you would send an email here
    // For now, just log the token (remove in production!)
    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(`Reset URL: ${req.headers.origin || 'http://localhost:5173'}/reset-password?token=${resetToken}`);

    res.json(successResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { message: error.errors[0].message } });
    }
    next(error);
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = ResetPasswordSchema.parse(req.body);

    // Find valid token
    const tokens = await query<{ id: number; user_id: number; expires_at: Date; used: boolean }>(
      'SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = $1',
      [token]
    );

    if (tokens.length === 0) {
      return res.status(400).json({ error: { message: 'Invalid or expired reset token' } });
    }

    const resetToken = tokens[0];

    if (resetToken.used) {
      return res.status(400).json({ error: { message: 'This reset token has already been used' } });
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(400).json({ error: { message: 'Reset token has expired' } });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Update password and mark token as used
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);
    await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetToken.id]);

    // Invalidate all existing sessions for this user
    await query('DELETE FROM sessions WHERE user_id = $1', [resetToken.user_id]);

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { message: error.errors[0].message } });
    }
    next(error);
  }
});

export default router;

// Export JWT_SECRET for middleware
export { JWT_SECRET };
