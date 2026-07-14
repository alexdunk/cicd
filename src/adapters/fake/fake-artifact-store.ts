import type { ArtifactStore } from '../../ports/artifacts.ts';

/**
 * In-memory artifact store fake. Upload URLs point at the local dev server's
 * fake S3 endpoint (see src/local/dev-server.ts); `putObject` is what that
 * endpoint calls when a client PUTs to the presigned URL.
 */
export class FakeArtifactStore implements ArtifactStore {
  private readonly objects = new Map<string, { sizeBytes: number }>();

  /**
   * Provider of the base URL for upload links, e.g.
   * () => "http://127.0.0.1:52341/_fake-s3". A function because the dev
   * server only knows its port after it starts listening.
   */
  constructor(private readonly uploadBaseUrl: () => string) {}

  createUploadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const url = new URL(`${this.uploadBaseUrl()}/${key}`);
    url.searchParams.set('expiresIn', String(expiresInSeconds));
    return Promise.resolve(url.toString());
  }

  headObject(key: string): Promise<{ sizeBytes: number } | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  putObject(key: string, sizeBytes: number): void {
    this.objects.set(key, { sizeBytes });
  }
}
