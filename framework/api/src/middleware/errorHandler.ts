/**
 * Common Error Handler Middleware
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Create a standardized API error
 */
export function createApiError(
  message: string,
  code?: string,
  details?: unknown
): ApiError {
  return { message, code, details };
}

/**
 * Standard error handler middleware
 *
 * Handles:
 * - Zod validation errors
 * - Custom ApiError objects
 * - Generic errors
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', err);

  // Zod validation error
  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      errors: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Check for status code in error
  const statusCode = (err as any)?.statusCode || (err as any)?.status || 500;

  // Generic error
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(statusCode).json({
    message,
    code: 'INTERNAL_ERROR',
  });
};

/**
 * Not found handler middleware
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    message: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
}
