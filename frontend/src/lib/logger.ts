/**
 * Simple logging utility that respects environment.
 * In development, logs are output to console.
 * In production, only errors are logged.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * Log debug information (development only)
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.debug('[DEBUG]', ...args);
    }
  },

  /**
   * Log general information (development only)
   */
  log: (...args: unknown[]) => {
    if (isDev) {
      console.log('[LOG]', ...args);
    }
  },

  /**
   * Log warnings (development only)
   */
  warn: (...args: unknown[]) => {
    if (isDev) {
      console.warn('[WARN]', ...args);
    }
  },

  /**
   * Log errors (always, even in production)
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};
