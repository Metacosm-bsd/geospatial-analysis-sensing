import { type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { config } from '../config/index.js';

/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string | undefined;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    options?: {
      isOperational?: boolean;
      code?: string;
      details?: unknown;
    }
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
    this.code = options?.code;
    this.details = options?.details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error factory functions
 */
export const errors = {
  badRequest: (message: string, details?: unknown) =>
    new AppError(message, 400, { code: 'BAD_REQUEST', details }),

  unauthorized: (message = 'Authentication required') =>
    new AppError(message, 401, { code: 'UNAUTHORIZED' }),

  forbidden: (message = 'Access denied') =>
    new AppError(message, 403, { code: 'FORBIDDEN' }),

  notFound: (resource = 'Resource') =>
    new AppError(`${resource} not found`, 404, { code: 'NOT_FOUND' }),

  conflict: (message: string) =>
    new AppError(message, 409, { code: 'CONFLICT' }),

  unprocessableEntity: (message: string, details?: unknown) =>
    new AppError(message, 422, { code: 'UNPROCESSABLE_ENTITY', details }),

  tooManyRequests: (message = 'Too many requests') =>
    new AppError(message, 429, { code: 'TOO_MANY_REQUESTS' }),

  internal: (message = 'Internal server error') =>
    new AppError(message, 500, { code: 'INTERNAL_ERROR', isOperational: false }),
};

/**
 * Format Zod validation errors
 */
const formatZodError = (error: ZodError): { field: string; message: string }[] => {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
};

/**
 * Error response interface
 */
interface ErrorResponse {
  error: string;
  message: string;
  code?: string | undefined;
  details?: unknown;
  stack?: string | undefined;
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log the error
  if (err instanceof AppError && err.isOperational) {
    logger.warn(`Operational error: ${err.message}`, {
      statusCode: err.statusCode,
      code: err.code,
    });
  } else {
    logger.error('Unexpected error:', {
      message: err.message,
      stack: err.stack,
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: 'Validation Error',
      message: 'Invalid request data',
      code: 'VALIDATION_ERROR',
      details: formatZodError(err),
    };

    res.status(400).json(response);
    return;
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: err.name,
      message: err.message,
      code: err.code,
      details: err.details,
    };

    // Include stack trace in development
    if (config.isDevelopment) {
      response.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: 'Authentication Error',
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: 'Authentication Error',
      message: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as Error & { code?: string; meta?: { target?: string[] } };

    if (prismaError.code === 'P2002') {
      const field = prismaError.meta?.target?.[0] ?? 'field';
      res.status(409).json({
        error: 'Conflict',
        message: `A record with this ${field} already exists`,
        code: 'DUPLICATE_ENTRY',
      });
      return;
    }

    if (prismaError.code === 'P2025') {
      res.status(404).json({
        error: 'Not Found',
        message: 'Record not found',
        code: 'NOT_FOUND',
      });
      return;
    }
  }

  // Handle syntax errors in JSON body
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
    });
    return;
  }

  // Default error response for unexpected errors
  const response: ErrorResponse = {
    error: 'Internal Server Error',
    message: config.isProduction ? 'An unexpected error occurred' : err.message,
    code: 'INTERNAL_ERROR',
  };

  // Include stack trace in development
  if (config.isDevelopment) {
    response.stack = err.stack;
  }

  res.status(500).json(response);
};

/**
 * Async handler wrapper to catch async errors
 */
export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default errorHandler;
