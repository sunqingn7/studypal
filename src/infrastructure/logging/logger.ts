import type { Logger, LogLevel, LogEntry, LoggingConfig } from '../../domain/models/logging';

const DEFAULT_CONFIG: LoggingConfig = {
  level: 'info',
  enabled: true,
  maxEntries: 1000,
  consoleOutput: false,
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class LoggerImpl implements Logger {
  private config: LoggingConfig;
  private context: string;

  constructor(context: string, config: LoggingConfig = DEFAULT_CONFIG) {
    this.context = context;
    this.config = config;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: this.context,
      data,
    };

    if (this.config.consoleOutput) {
      const timestamp = new Date(entry.timestamp).toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;

      switch (level) {
        case 'debug':
          // eslint-disable-next-line no-console
          console.debug(prefix, message, data ?? '');
          break;
        case 'info':
          // eslint-disable-next-line no-console
          console.info(prefix, message, data ?? '');
          break;
        case 'warn':
          console.warn(prefix, message, data ?? '');
          break;
        case 'error':
          console.error(prefix, message, data ?? '');
          break;
      }
    }

    // In the future, we could persist logs to storage here
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    const data = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;
    this.log('error', message, data);
  }

  setConfig(config: Partial<LoggingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createLogger(context: string, config?: Partial<LoggingConfig>): Logger {
  return new LoggerImpl(context, { ...DEFAULT_CONFIG, ...config });
}

// Singleton logger instance for application-wide logging
export const appLogger = createLogger('App');
