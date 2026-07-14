import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '../ports/clock.ts';

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

export const uuidGenerator: IdGenerator = {
  newId: () => randomUUID(),
};
