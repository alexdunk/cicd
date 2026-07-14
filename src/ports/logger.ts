export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured logger port. Fields must never contain tokens or package bytes. */
export interface Logger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  /** Returns a logger that includes the given fields on every entry. */
  with(fields: Record<string, unknown>): Logger;
}
