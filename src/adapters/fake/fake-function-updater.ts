import { createHash } from 'node:crypto';
import type { FunctionCodeUpdater } from '../../ports/functions.ts';

/**
 * Fake Lambda control plane. Knows a fixed set of "existing" functions and
 * fails updates to unknown ones, mirroring the AWS ResourceNotFoundException
 * path so the failed-deployment flow is exercisable locally.
 */
export class FakeFunctionUpdater implements FunctionCodeUpdater {
  private version = 0;

  constructor(private readonly knownFunctions: ReadonlySet<string>) {}

  updateFunctionCode(input: {
    functionName: string;
    s3Key: string;
  }): Promise<{ codeSha256: string; functionVersion: string | null }> {
    if (!this.knownFunctions.has(input.functionName)) {
      return Promise.reject(
        new Error(`ResourceNotFoundException: Function not found: ${input.functionName}`),
      );
    }
    this.version += 1;
    const codeSha256 = createHash('sha256')
      .update(`${input.functionName}:${input.s3Key}`)
      .digest('base64');
    return Promise.resolve({ codeSha256, functionVersion: String(this.version) });
  }
}
