export async function PreflightWorkflow(jobId: string, assetUrl: string): Promise<any> {
  return {
    ok: true,
    jobId,
    assetUrl,
    status: 'WORKFLOW_PLACEHOLDER'
  };
}
