import { markBuildAvailable, newBuild, type Build } from '../domain/build.ts';
import { badRequest, notFound } from '../domain/errors.ts';
import type { ArtifactStore } from '../ports/artifacts.ts';
import type { Clock, IdGenerator } from '../ports/clock.ts';
import type { BuildStore } from '../ports/stores.ts';

/** Presigned upload URLs stay valid long enough for a CI upload, no longer. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface RegisterBuildResult {
  build: Build;
  uploadUrl: string;
  uploadUrlExpiresInSeconds: number;
}

/**
 * Build lifecycle: register (create metadata + presigned S3 upload URL),
 * confirm upload completion against S3, and read back metadata. Package bytes
 * never pass through this service.
 */
export class BuildService {
  constructor(
    private readonly builds: BuildStore,
    private readonly artifacts: ArtifactStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async register(input: {
    name: string;
    gitCommit: string | null;
    clientId: string;
  }): Promise<RegisterBuildResult> {
    const build = newBuild({
      buildId: this.ids.newId(),
      name: input.name,
      gitCommit: input.gitCommit,
      createdBy: input.clientId,
      now: this.clock.now(),
    });
    await this.builds.put(build);
    const uploadUrl = await this.artifacts.createUploadUrl(build.s3Key, UPLOAD_URL_TTL_SECONDS);
    return { build, uploadUrl, uploadUrlExpiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  /** Confirms the client finished uploading; verifies the object exists in S3. */
  async completeUpload(buildId: string): Promise<Build> {
    const build = await this.getBuild(buildId);
    const head = await this.artifacts.headObject(build.s3Key);
    if (head === null) {
      throw badRequest(
        `No package found in storage for build ${buildId}. Upload to the presigned URL before calling complete.`,
      );
    }
    const updated = markBuildAvailable(build, head.sizeBytes, this.clock.now());
    await this.builds.put(updated);
    return updated;
  }

  async getBuild(buildId: string): Promise<Build> {
    const build = await this.builds.get(buildId);
    if (!build) {
      throw notFound(`Build ${buildId} does not exist.`);
    }
    return build;
  }

  async listBuilds(limit: number): Promise<Build[]> {
    return this.builds.list(limit);
  }
}
