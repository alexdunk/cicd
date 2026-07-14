/**
 * Lambda control-plane port. Backed by the AWS Lambda API in production,
 * a fake locally.
 */
export interface FunctionCodeUpdater {
  /**
   * Points the target function's code at the stored package
   * (Lambda UpdateFunctionCode from S3) and waits until the update completes.
   * Throws on any failure, including unknown function or invalid package.
   */
  updateFunctionCode(input: {
    functionName: string;
    s3Key: string;
  }): Promise<{ codeSha256: string; functionVersion: string | null }>;
}
