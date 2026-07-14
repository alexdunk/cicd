import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ArtifactStore } from '../../ports/artifacts.ts';

export class S3ArtifactStore implements ArtifactStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async createUploadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: 'application/zip' }),
      { expiresIn: expiresInSeconds },
    );
  }

  async headObject(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const out = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: out.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    ((error as { name: string }).name === 'NotFound' ||
      (error as { name: string }).name === 'NoSuchKey')
  );
}
