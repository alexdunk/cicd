import type { Logger, LogLevel } from '../ports/logger.ts';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * JSON-lines logger writing to stdout, which Lambda ships to CloudWatch.
 * One line per entry: timestamp, level, message, then bound + call fields.
 */
export function createConsoleLogger(
  minLevel: LogLevel = 'info',
  boundFields: Record<string, unknown> = {},
): Logger {
  return {
    log(level, message, fields) {
      if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          level,
          message,
          ...boundFields,
          ...fields,
        }),
      );
    },
    with(fields) {
      return createConsoleLogger(minLevel, { ...boundFields, ...fields });
    },
  };
}
