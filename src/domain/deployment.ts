import { conflict } from './errors.ts';

/**
 * A deployment is one attempt to update a target Lambda function's code from
 * a stored build package. Every state change is recorded as a transition so
 * clients can audit what happened and when.
 */
export type DeploymentStatus = 'requested' | 'in_progress' | 'succeeded' | 'failed';

export interface DeploymentTransition {
  status: DeploymentStatus;
  at: string;
  message: string | null;
}

export interface DeploymentResult {
  /** SHA-256 of the deployed code as reported by the Lambda API. */
  codeSha256: string;
  /** Lambda function version created or updated, if reported. */
  functionVersion: string | null;
}

export interface Deployment {
  deploymentId: string;
  buildId: string;
  targetFunction: string;
  status: DeploymentStatus;
  transitions: readonly DeploymentTransition[];
  result: DeploymentResult | null;
  error: string | null;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
}

const ALLOWED_TRANSITIONS: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  requested: ['in_progress'],
  in_progress: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
};

export function newDeployment(input: {
  deploymentId: string;
  buildId: string;
  targetFunction: string;
  requestedBy: string;
  now: string;
}): Deployment {
  return {
    deploymentId: input.deploymentId,
    buildId: input.buildId,
    targetFunction: input.targetFunction,
    status: 'requested',
    transitions: [{ status: 'requested', at: input.now, message: null }],
    result: null,
    error: null,
    requestedBy: input.requestedBy,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Applies a state transition, rejecting any move the lifecycle does not allow. */
export function transitionDeployment(
  deployment: Deployment,
  to: DeploymentStatus,
  now: string,
  options: { message?: string; result?: DeploymentResult; error?: string } = {},
): Deployment {
  if (!ALLOWED_TRANSITIONS[deployment.status].includes(to)) {
    throw conflict(
      `Deployment ${deployment.deploymentId} cannot move from ${deployment.status} to ${to}.`,
    );
  }
  return {
    ...deployment,
    status: to,
    transitions: [
      ...deployment.transitions,
      { status: to, at: now, message: options.message ?? null },
    ],
    result: options.result ?? deployment.result,
    error: options.error ?? deployment.error,
    updatedAt: now,
  };
}
