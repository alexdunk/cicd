/** Time and ID generation are injected so tests are deterministic. */
export interface Clock {
  /** Current time as an ISO-8601 string. */
  now(): string;
}

export interface IdGenerator {
  newId(): string;
}
