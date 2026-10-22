/**
 * src/ui/lib/paperSupplierApi.ts
 * 
 * Specialized HTTP client for Paper Supplier Hub endpoints.
 * 
 * Guarantees:
 * 1. Preserves real HTTP status codes (400, 403, 404, 409, 500) and error payloads.
 * 2. Never swallows errors into synthetic ok:true fallbacks.
 * 3. Never skips mutations via silent backoff.
 * 4. Resolves authenticated token, tenant, and supplier identity headers.
 */

import {
    getAuthToken,
    clearAuthToken,
    getUserTenantId,
    getUserSupplierId,
    getActiveContext
} from './authStore';

export interface SupplierApiErrorDetails {
    status: number;
    code: string;
    message: string;
    validationErrors?: string[];
    raw?: any;
}

export class SupplierApiError extends Error {
    public status: number;
    public code: string;
    public validationErrors: string[];
    public raw: any;

    constructor(details: SupplierApiErrorDetails) {
        super(details.message || `HTTP ${details.status} Error`);
        this.name = 'SupplierApiError';
        this.status = details.status;
        this.code = details.code || 'API_ERROR';
        this.validationErrors = details.validationErrors || [];
        this.raw = details.raw;
    }
}

export interface PaperSupplierApiResponse<T = any> {
    ok: boolean;
    data: T;
    error?: {
        code: string;
        message: string;
        validationErrors?: string[];
    };
}

export interface PaperSupplierFetchOptions extends RequestInit {
    tenantId?: string;
    supplierId?: string;
}

export async function paperSupplierFetch<T = any>(
    path: string,
    options?: PaperSupplierFetchOptions
): Promise<PaperSupplierApiResponse<T>> {
    const token = getAuthToken();
    const storedTenantId = getUserTenantId();
    const storedSupplierId = getUserSupplierId();
    const activeContext = getActiveContext();

    const isFormData = options?.body instanceof FormData;
    const headers: Record<string, string> = {
        "Accept": "application/json",
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(options?.tenantId || storedTenantId ? { "X-Tenant-Id": options?.tenantId || storedTenantId } : {}),
        ...(options?.supplierId || storedSupplierId ? { "X-Supplier-Id": options?.supplierId || storedSupplierId } : {}),
        ...(activeContext ? { "X-Active-Context": activeContext } : {}),
        ...(options?.headers as any || {})
    };

    if (isFormData && headers["Content-Type"]) {
        delete headers["Content-Type"];
    }

    let response: Response;
    try {
        response = await fetch(path, {
            ...options,
            headers,
            credentials: 'include'
        });
    } catch (networkErr: any) {
        throw new SupplierApiError({
            status: 0,
            code: 'NETWORK_ERROR',
            message: networkErr?.message || 'Network connection error while contacting paper supplier service.'
        });
    }

    if (response.status === 401) {
        clearAuthToken();
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        throw new SupplierApiError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Session expired or invalid credentials. Please log in again.'
        });
    }

    let parsedBody: any = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            parsedBody = await response.json();
        } catch (jsonErr: any) {
            parsedBody = null;
        }
    } else {
        const text = await response.text();
        parsedBody = { text };
    }

    if (!response.ok) {
        const errObj = parsedBody?.error || {};
        const code = errObj.code || (typeof parsedBody?.code === 'string' ? parsedBody.code : `HTTP_${response.status}`);
        const message = errObj.message || parsedBody?.message || parsedBody?.error || `Request failed with status ${response.status}`;
        const validationErrors = errObj.validationErrors || parsedBody?.validationErrors || [];

        throw new SupplierApiError({
            status: response.status,
            code,
            message,
            validationErrors,
            raw: parsedBody
        });
    }

    return parsedBody as PaperSupplierApiResponse<T>;
}
