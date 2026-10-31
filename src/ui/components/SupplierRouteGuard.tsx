import React from 'react';
import { Navigate } from 'react-router-dom';
import { isSupplierUser, isSuperAdmin, isPaperSupplierHubEnabled } from '../lib/authStore';

interface SupplierRouteGuardProps {
    children: React.ReactNode;
}

/**
 * SupplierRouteGuard
 * Enforces:
 * 1. Paper Supplier Hub feature flag enabled.
 * 2. Authenticated user has a Supplier role (SUPPLIER_ADMIN, SUPPLIER_OPERATOR, SUPPLIER_VIEWER) or is SUPER_ADMIN.
 * Redirects unauthorized users to /dashboard.
 */
export const SupplierRouteGuard: React.FC<SupplierRouteGuardProps> = ({ children }) => {
    const isEnabled = isPaperSupplierHubEnabled();
    const isSupplier = isSupplierUser();
    const isAdmin = isSuperAdmin();

    if (!isEnabled) {
        return <Navigate to="/dashboard" replace />;
    }

    if (!isSupplier && !isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};
