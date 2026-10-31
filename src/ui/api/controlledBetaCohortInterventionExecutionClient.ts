import {
  CohortInterventionExecution,
  CohortInterventionExecutionStep
} from '../types/controlledBetaCohortInterventionExecution';

export class ControlledBetaCohortInterventionExecutionClient {
  private baseUrl = '/api/admin/beta/cohort-intervention-executions';

  async listExecutions(): Promise<{ ok: boolean; executions: CohortInterventionExecution[] }> {
    const res = await fetch(`${this.baseUrl}/executions`);
    return res.json();
  }

  async getExecution(executionId: string): Promise<{
    ok: boolean;
    execution: CohortInterventionExecution;
    steps: CohortInterventionExecutionStep[];
  }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}`);
    return res.json();
  }

  async createExecutionFromApproval(approvalId: string): Promise<{
    ok: boolean;
    execution: CohortInterventionExecution;
    steps: CohortInterventionExecutionStep[];
  }> {
    const res = await fetch(`${this.baseUrl}/executions/from-approval/${approvalId}`, {
      method: 'POST'
    });
    return res.json();
  }

  async generateDryRun(executionId: string): Promise<{
    ok: boolean;
    dry_run_id: string;
    dry_run_hash: string;
    preview_mutations: any[];
  }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/dry-run`, {
      method: 'POST'
    });
    return res.json();
  }

  async createRollbackPlan(executionId: string): Promise<{
    ok: boolean;
    rollback_plan_id: string;
    rollback_payload: any;
  }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/rollback-plan`, {
      method: 'POST'
    });
    return res.json();
  }

  async confirmExecution(executionId: string, signature: string, phrase: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, phrase })
    });
    return res.json();
  }

  async executeIntervention(executionId: string): Promise<{
    ok: boolean;
    execution_status: string;
    result_status: string;
    evidence_pack_hash: string;
  }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/execute`, {
      method: 'POST'
    });
    return res.json();
  }

  async cancelExecution(executionId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return res.json();
  }

  async rollbackExecution(executionId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/rollback`, {
      method: 'POST'
    });
    return res.json();
  }

  async supersedeExecution(executionId: string, supersededByExecutionId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/supersede`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supersededByExecutionId, reason })
    });
    return res.json();
  }

  async getEvidencePack(executionId: string): Promise<{ ok: boolean; evidencePack: any }> {
    const res = await fetch(`${this.baseUrl}/executions/${executionId}/evidence-pack`);
    return res.json();
  }
}

export const cohortInterventionExecutionClient = new ControlledBetaCohortInterventionExecutionClient();
