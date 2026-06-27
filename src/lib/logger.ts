// Centralised error logger — drop-in for Sentry later
// Set SENTRY_DSN env var to enable Sentry reporting

type Level = 'error' | 'warn' | 'info';

interface LogContext {
  path?: string;
  userId?: string;
  [key: string]: unknown;
}

export function log(level: Level, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    ...context,
  };

  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export function logError(error: unknown, context?: LogContext) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  log('error', message, { ...context, stack });
}
