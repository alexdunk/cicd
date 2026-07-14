import { conflict } from './errors.ts';

/**
 * A build is metadata about one Lambda deployment package (zip) stored in S3.
 * The package bytes never pass through this API; clients upload directly to
 * S3 with a presigned URL.
 */
export type BuildStatus = 'pending_upload' | 'available';

export interface Build {
  buildId: string;
  /** Client-supplied package name, e.g. the service being built. */
  name: string;
  /** Optional VCS commit the package was built from. */
  gitCommit: string | null;
  status: BuildStatus;
  /** Object key of the package in the artifact bucket. */
  s3Key: string;
  /** Size reported by S3 once the upload is confirmed. */
  sizeBytes: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function newBuild(input: {
  buildId: string;
  name: string;
  gitCommit: string | null;
  createdBy: string;
  now: string;
}): Build {
  return {
    buildId: input.buildId,
    name: input.name,
    gitCommit: input.gitCommit,
    status: 'pending_upload',
    s3Key: `builds/${input.buildId}.zip`,
    sizeBytes: null,
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Marks the package as uploaded. Only valid from `pending_upload`. */
export function markBuildAvailable(build: Build, sizeBytes: number, now: string): Build {
  if (build.status !== 'pending_upload') {
    throw conflict(`Build ${build.buildId} is already ${build.status}.`);
  }
  return { ...build, status: 'available', sizeBytes, updatedAt: now };
}
