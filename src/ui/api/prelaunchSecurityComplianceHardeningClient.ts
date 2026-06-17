import { adminFetch as adminApi } from '../lib/adminApi';
import type {
  SecurityScanResult,
  SecurityEvidencePack,
  RecordFindingPayload,
  ResolveFindingPayload,
} from '../types/prelaunchSecurityComplianceHardening';

const BASE = '/api/admin/prelaunch/security-compliance';

export async function scanEnvExposure(): Promise<{ ok: boolean } & Partial<SecurityScanResult>> {
  return adminApi(`${BASE}/scan/env-exposure`);
}

export async function scanAdminRouteProtection(): Promise<{ ok: boolean } & Partial<SecurityScanResult>> {
  return adminApi(`${BASE}/scan/admin-routes`);
}

export async function scanSecretLeakagePatterns(): Promise<{ ok: boolean } & Partial<SecurityScanResult>> {
  return adminApi(`${BASE}/scan/secret-leakage`);
}

export async function scanRedactionCoverage(): Promise<{ ok: boolean } & Partial<SecurityScanResult>> {
  return adminApi(`${BASE}/scan/redaction`);
}

export async function evaluateRoleBoundaries(): Promise<{ ok: boolean } & Partial<SecurityScanResult>> {
  return adminApi(`${BASE}/scan/role-boundaries`);
}

export async function evaluateComplianceGuardrails(): Promise<{ ok: boolean } & Record<string, unknown>> {
  return adminApi(`${BASE}/scan/compliance-guardrails`);
}

export async function recordSecurityFinding(payload: RecordFindingPayload): Promise<{ ok: boolean } & Record<string, unknown>> {
  return adminApi(`${BASE}/finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function resolveSecurityFinding(payload: ResolveFindingPayload): Promise<{ ok: boolean } & Record<string, unknown>> {
  return adminApi(`${BASE}/resolve-finding`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getSecurityComplianceEvidencePack(): Promise<{ ok: boolean } & Partial<SecurityEvidencePack>> {
  return adminApi(`${BASE}/evidence-pack`);
}
