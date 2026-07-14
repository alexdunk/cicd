/**
 * Build package storage port. Backed by S3 in production. Packages never pass
 * through the API process; clients upload directly via presigned URLs.
 */
export interface ArtifactStore {
  /** Presigned PUT URL for uploading a package to the given key. */
  createUploadUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Object size in bytes, or null when the object does not exist. */
  headObject(key: string): Promise<{ sizeBytes: number } | null>;
}
