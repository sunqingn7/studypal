/**
 * Application-wide error types for consistent error handling
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = Date.now();
    this.context = context;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class AIProviderError extends AppError {
  constructor(message: string, public readonly provider: string, context?: Record<string, unknown>) {
    super(message, `AI_PROVIDER_${provider.toUpperCase()}_ERROR`, context);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', context);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
  }
}

export class FileOperationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'FILE_OPERATION_ERROR', context);
  }
}

export class PluginError extends AppError {
  constructor(message: string, public readonly pluginId: string, context?: Record<string, unknown>) {
    super(message, `PLUGIN_${pluginId}_ERROR`, context);
  }
}

export interface ErrorInfo {
  message: string;
  code: string;
  timestamp: number;
  stack?: string;
  context?: Record<string, unknown>;
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
}

/**
 * Safely convert unknown error to ErrorInfo
 */
export function toErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      timestamp: error.timestamp,
      stack: error.stack,
      context: error.context,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'UNKNOWN_ERROR',
      timestamp: Date.now(),
      stack: error.stack,
    };
  }

  return {
    message: getErrorMessage(error),
    code: 'UNKNOWN_ERROR',
    timestamp: Date.now(),
    context: error && typeof error === 'object' ? error as Record<string, unknown> : undefined,
  };
}
