/**
 * src/ui/lib/printhouseCalibrationApi.ts
 *
 * Phase 193F Frontend API Client.
 * Communicates exclusively with canonical backend endpoints from Phases 193B, 193C, 193D, 193E.
 *
 * Invariants:
 * 1. Uses canonical getAuthToken() helper (never reads localStorage directly).
 * 2. Zero client-side pricing calculations or formula logic.
 * 3. Zero rate patch derivation on client.
 * 4. Zero activation grants mutation.
 */
import { getAuthToken } from './authStore';

const BASE_URL = '/api/printhouse/onboarding/pricing';

function getHeaders(): HeadersInit {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

async function handleResponse<T>(res: Response): Promise<T> {
    const json = await res.json();
    if (!res.ok || json.ok === false) {
        const errCode = json.error || json.code || `HTTP_${res.status}`;
        const errMsg = json.message || (typeof json.error === 'string' ? json.error : `Request failed with status ${res.status}`);
        const error = new Error(errMsg);
        (error as any).status = res.status;
        (error as any).code = errCode;
        (error as any).details = json.details;
        throw error;
    }
    return json.data !== undefined ? json.data : json;
}

export interface CalibrationRun {
    id: string;
    tenantId?: string;
    calibrationSessionId?: string;
    printerNodeId?: string;
    solverVersion?: string;
    solverConfig?: any;
    status: string;
    sessionInputChecksum?: string;
    rateSnapshotChecksum?: string;
    evaluationsCount?: number;
    executionDurationMs?: number;
    enginePriceBefore?: number;
    enginePriceAfter: number;
    targetPrice: number;
    absoluteResidual: number;
    percentResidual: number;
    activeRatePaths?: string[];
    proposedPatch?: Record<string, any>;
    candidateParameters?: any;
    identifiabilityReport?: any;
    warnings?: any[];
    error?: any;
    createdBy?: any;
    startedAt?: string;
    completedAt?: string;
}

export interface CreateCalibrationSessionPayload {
    printerNodeId: string;
    referenceBookName?: string;
    bookSpec: any;
    targetManufacturingPrice: number;
    currency?: string;
    transportPricePerKg?: number | null;
    transportCurrency?: string;
    includesPaper?: boolean | null;
    includesBinding?: boolean | null;
    includesFinishing?: boolean | null;
    includesPackaging?: boolean | null;
}

export const printhouseCalibrationApi = {
    // ── Phase 193B: Reference Book & Calibration Sessions ───────────────────
    async createSession(payload: CreateCalibrationSessionPayload) {
        const res = await fetch(`${BASE_URL}/calibrations`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        return handleResponse<any>(res);
    },

    async listSessions(printerNodeId?: string) {
        const query = printerNodeId ? `?printerNodeId=${encodeURIComponent(printerNodeId)}` : '';
        const res = await fetch(`${BASE_URL}/calibrations${query}`, {
            headers: getHeaders()
        });
        return handleResponse<any[]>(res);
    },

    async getSession(sessionId: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}`, {
            headers: getHeaders()
        });
        return handleResponse<any>(res);
    },

    async updateDraftSession(sessionId: string, payload: {
        referenceBookName?: string;
        bookSpec?: any;
        targetManufacturingPrice?: number | null;
        currency?: string;
        transportPricePerKg?: number | null;
        transportCurrency?: string;
        includesPaper?: boolean | null;
        includesBinding?: boolean | null;
        includesFinishing?: boolean | null;
        includesPackaging?: boolean | null;
        notes?: string;
    }) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        return handleResponse<any>(res);
    },

    async markSessionReady(sessionId: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/ready`, {
            method: 'POST',
            headers: getHeaders()
        });
        return handleResponse<any>(res);
    },

    async rejectSession(sessionId: string, reason?: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/reject`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ reason })
        });
        return handleResponse<any>(res);
    },

    async supersedeSession(sessionId: string, reason?: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/supersede`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ reason })
        });
        return handleResponse<{ oldSession: any, newSession: any }>(res);
    },

    // ── Phase 193C: Deterministic Inverse Solver Runs ────────────────────────
    async calculateCalibration(sessionId: string, tolerancePolicy?: any) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/calculate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tolerancePolicy })
        });
        return handleResponse<any>(res);
    },

    async listRuns(sessionId: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/runs`, {
            headers: getHeaders()
        });
        return handleResponse<any[]>(res);
    },

    async getRun(sessionId: string, runId: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/runs/${runId}`, {
            headers: getHeaders()
        });
        return handleResponse<any>(res);
    },

    // ── Phase 193D: Governed Calibration Acceptance & Immutable Revisions ───
    async acceptCalibrationRun(sessionId: string, runId: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/accept`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ runId })
        });
        return handleResponse<any>(res);
    },

    async listRevisions(printerNodeId?: string) {
        const query = printerNodeId ? `?printerNodeId=${encodeURIComponent(printerNodeId)}` : '';
        const res = await fetch(`${BASE_URL}/revisions${query}`, {
            headers: getHeaders()
        });
        return handleResponse<any[]>(res);
    },

    async getRevision(revisionId: string) {
        const res = await fetch(`${BASE_URL}/revisions/${revisionId}`, {
            headers: getHeaders()
        });
        return handleResponse<any>(res);
    },

    // ── Phase 193E / Phase 193F.2: AI Conversational Calibration Assistant (Zero-Write) ────
    async interpretPreSession(message: string) {
        const res = await fetch(`${BASE_URL}/calibration-assistant/interpret`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ message })
        });
        return handleResponse<{
            ok: boolean;
            proposal: {
                intent: string;
                specPatch: any;
                declaredCommercials: any;
                clarificationQuestions: Array<{ field: string; question: string; options?: string[] }>;
                explanation: string;
                warnings: string[];
                readyForValidation: boolean;
            };
            model: string;
            latencyMs: number;
        }>(res);
    },

    async assistantChat(sessionId: string, message: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/assistant/chat`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ message })
        });
        return handleResponse<{
            ok: boolean;
            sessionId: string;
            proposal: {
                intent: string;
                specPatch: any;
                declaredCommercials: any;
                clarificationQuestions: Array<{ field: string; question: string; options?: string[] }>;
                explanation: string;
                warnings: string[];
                readyForValidation: boolean;
            };
            model: string;
            latencyMs: number;
        }>(res);
    },

    async explainRun(sessionId: string, runId: string) {
        const res = await fetch(`${BASE_URL}/calibrations/${sessionId}/assistant/explain-run`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ runId })
        });
        return handleResponse<{
            ok: boolean;
            runId: string;
            status: string;
            explanation: string;
            targetManufacturingPrice: number;
            predictedManufacturingPrice: number;
            absoluteResidual: number;
            warnings: any[];
            source?: string;
        }>(res);
    },

    // ── Phase 193H: Governed Quote Preview Smoke Test (Canonical BPE) ─────────
    async previewQuote(jobSpec: any, printerNodeId?: string) {
        const res = await fetch(`${BASE_URL}/quote-preview`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ jobSpec, printerNodeId })
        });
        return handleResponse<{
            ok: boolean;
            currency: string;
            quantity: number;
            totals: {
                manufacturing: number;
                finishing: number;
                binding: number;
                packaging: number;
                transport: number;
                commercialMarkup: number;
                tax: number;
                finalSellingPrice: number;
            };
            unitPrice: number;
            breakdown: Array<{ label: string; amount: number }>;
            productionLeadDays: number;
            estimatedDeliveryDays: number;
            shippingStatus: string;
            taxStatus: string;
            configurationTrace: string[];
            warnings: string[];
            engine: {
                package: string;
                version: string;
                forwardMethod: string;
            };
        }>(res);
    },

    // ── Phase 194E / Phase 194F: PDF Quote Evidence Upload & Corrections ─────
    async uploadQuoteEvidence(file: File) {
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${BASE_URL}/quote-evidence/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        return handleResponse<any>(res);
    },

    async getQuoteEvidence(id: string) {
        const res = await fetch(`${BASE_URL}/quote-evidence/${id}`, {
            headers: getHeaders()
        });
        return handleResponse<any>(res);
    },

    async saveOperatorCorrections(id: string, corrections: any) {
        const res = await fetch(`${BASE_URL}/quote-evidence/${id}/corrections`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(corrections)
        });
        return handleResponse<any>(res);
    },

    // ── Phase 195F-R: Commercial Pricing Knobs & Quote Calibration Preview ──────
    async previewCommercialKnobs(payload: {
        printhouseId?: string;
        bookSpec: any;
        quantities?: number[];
        adjustments?: any;
        quoteEvidenceId?: string;
        quotePoints?: Record<number, number>;
    }) {
        const res = await fetch(`${BASE_URL}/commercial-preview`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        return handleResponse<any>(res);
    },

    async fitCommercialCurve(payload: {
        printhouseId?: string;
        bookSpec: any;
        quantities?: number[];
        quoteEvidenceId?: string;
        quotePoints?: Record<number, number> | Array<{ quantity: number; manufacturingPrice: number }>;
    }) {
        const res = await fetch(`${BASE_URL}/commercial-fit`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        return handleResponse<any>(res);
    },

    async acceptCommercialCalibration(payload: {
        printhouseId?: string;
        printerNodeId?: string;
        baselineRatesChecksum: string;
        adjustments: any;
        quoteEvidenceId?: string;
        quotePoints?: Record<number, number> | Array<{ quantity: number; manufacturingPrice: number }>;
        bookSpec?: any;
        candidateRatesChecksum?: string;
    }) {
        const res = await fetch(`${BASE_URL}/commercial-accept`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        return handleResponse<{
            ok: boolean;
            accepted: boolean;
            revisionId: string;
            acceptanceId: string;
            activeRatesChecksum: string;
            baselineRatesChecksum: string;
            metrics: any;
            acceptedAt: string;
        }>(res);
    }
};

export function canonicalStringify(obj: any): string {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
        return '[' + obj.map(v => canonicalStringify(v)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

export async function computeBookSpecChecksum(spec: any): Promise<string | null> {
    if (!spec || typeof spec !== 'object') return null;
    const str = canonicalStringify(spec);

    // 1. Web Crypto API in browser / modern JS environment
    if (typeof crypto !== 'undefined' && crypto?.subtle && typeof TextEncoder !== 'undefined') {
        try {
            const msgUint8 = new TextEncoder().encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {}
    }

    // 2. Node.js fallback (if Web Crypto is unavailable)
    if (typeof process !== 'undefined' && process?.versions?.node) {
        try {
            const cryptoModule = require('crypto');
            return cryptoModule.createHash('sha256').update(str).digest('hex');
        } catch (e) {}
    }

    return null;
}
