import { UpdateFunctionCodeCommand, waitUntilFunctionUpdatedV2 } from '@aws-sdk/client-lambda';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import type { FunctionCodeUpdater } from '../../ports/functions.ts';

const UPDATE_WAIT_SECONDS = 60;

export class LambdaFunctionUpdater implements FunctionCodeUpdater {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly bucket: string,
  ) {}

  async updateFunctionCode(input: {
    functionName: string;
    s3Key: string;
  }): Promise<{ codeSha256: string; functionVersion: string | null }> {
    const out = await this.lambda.send(
      new UpdateFunctionCodeCommand({
        FunctionName: input.functionName,
        S3Bucket: this.bucket,
        S3Key: input.s3Key,
      }),
    );
    // UpdateFunctionCode returns before the update is applied; wait so a
    // "succeeded" deployment record means the new code is actually live.
    await waitUntilFunctionUpdatedV2(
      { client: this.lambda, maxWaitTime: UPDATE_WAIT_SECONDS },
      { FunctionName: input.functionName },
    );
    return {
      codeSha256: out.CodeSha256 ?? '',
      functionVersion: out.Version ?? null,
    };
  }
}
