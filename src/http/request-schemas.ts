import { z } from 'zod';
import { badRequest } from '../domain/errors.ts';

/** Request body schemas. All external input is parsed here before use. */

export const registerBuildSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._-]+$/, 'name may contain only letters, digits, ".", "_", "-"'),
  gitCommit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/, 'gitCommit must be a hex commit hash')
    .nullish(),
});

export const createDeploymentSchema = z.object({
  // Build IDs are opaque identifiers issued by this API; existence is
  // checked against the store, so only the shape is validated here.
  buildId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9-]+$/, 'buildId must be an identifier issued by POST /v1/builds'),
  targetFunction: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-zA-Z0-9-_]+$/, 'targetFunction must be a plain Lambda function name'),
});

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/** Parses the optional `limit` query parameter shared by the list endpoints. */
export function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIST_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw badRequest(`Query parameter "limit" must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
  }
  return limit;
}

/** Parses a JSON request body against a schema, mapping failures to 400s. */
export function parseBody<T>(schema: z.ZodType<T>, rawBody: string | null): T {
  if (rawBody === null || rawBody.trim() === '') {
    throw badRequest('Request body is required and must be JSON.');
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw badRequest(
      'Request body failed validation.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
