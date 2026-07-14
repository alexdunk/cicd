import { describe, expect, it } from 'vitest';
import { markBuildAvailable, newBuild } from '../../src/domain/build.ts';
import { hashToken } from '../../src/domain/client.ts';
import { newDeployment, transitionDeployment } from '../../src/domain/deployment.ts';
import { AppError } from '../../src/domain/errors.ts';

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-01T00:00:01.000Z';

describe('build lifecycle', () => {
  const build = newBuild({
    buildId: 'b-1',
    name: 'svc',
    gitCommit: null,
    createdBy: 'ci',
    now: NOW,
  });

  it('starts pending upload with a derived S3 key', () => {
    expect(build.status).toBe('pending_upload');
    expect(build.s3Key).toBe('builds/b-1.zip');
    expect(build.sizeBytes).toBeNull();
  });

  it('becomes available with the uploaded size', () => {
    const available = markBuildAvailable(build, 1234, LATER);
    expect(available.status).toBe('available');
    expect(available.sizeBytes).toBe(1234);
    expect(available.updatedAt).toBe(LATER);
  });

  it('rejects completing an already-available build', () => {
    const available = markBuildAvailable(build, 1234, LATER);
    expect(() => markBuildAvailable(available, 1234, LATER)).toThrowError(AppError);
    expect(() => markBuildAvailable(available, 1234, LATER)).toThrowError(/already available/);
  });
});

describe('deployment lifecycle', () => {
  const deployment = newDeployment({
    deploymentId: 'd-1',
    buildId: 'b-1',
    targetFunction: 'fn',
    requestedBy: 'ci',
    now: NOW,
  });

  it('records the requested transition on creation', () => {
    expect(deployment.status).toBe('requested');
    expect(deployment.transitions).toEqual([{ status: 'requested', at: NOW, message: null }]);
  });

  it('walks requested -> in_progress -> succeeded and keeps the audit trail', () => {
    const inProgress = transitionDeployment(deployment, 'in_progress', LATER);
    const succeeded = transitionDeployment(inProgress, 'succeeded', LATER, {
      result: { codeSha256: 'sha', functionVersion: '2' },
    });
    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.result).toEqual({ codeSha256: 'sha', functionVersion: '2' });
    expect(succeeded.transitions.map((t) => t.status)).toEqual([
      'requested',
      'in_progress',
      'succeeded',
    ]);
  });

  it('records failure with the error message', () => {
    const inProgress = transitionDeployment(deployment, 'in_progress', LATER);
    const failed = transitionDeployment(inProgress, 'failed', LATER, { error: 'boom' });
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('boom');
  });

  it('rejects illegal transitions', () => {
    expect(() => transitionDeployment(deployment, 'succeeded', LATER)).toThrowError(
      /cannot move from requested to succeeded/,
    );
    const done = transitionDeployment(
      transitionDeployment(deployment, 'in_progress', LATER),
      'succeeded',
      LATER,
    );
    expect(() => transitionDeployment(done, 'failed', LATER)).toThrowError(AppError);
  });
});

describe('token hashing', () => {
  it('is deterministic SHA-256 hex and never the raw token', () => {
    const hash = hashToken('secret-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken('secret-token'));
    expect(hash).not.toContain('secret');
  });
});
