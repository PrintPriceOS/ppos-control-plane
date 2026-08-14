import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuthUser, getAuthToken } from '../../lib/authStore';
import { RefreshCw } from 'lucide-react';

interface ActivationGuardProps {
    children: React.ReactNode;
}

export const ActivationGuard: React.FC<ActivationGuardProps> = ({ children }) => {
    const user = getAuthUser();
    const isPrinthouseAdmin = user?.role === 'PRINTHOUSE_ADMIN';
    const [readinessLoading, setReadinessLoading] = useState(isPrinthouseAdmin);
    const [isCoreSetupComplete, setIsCoreSetupComplete] = useState(false);
    const [fetchError, setFetchError] = useState(false);

    useEffect(() => {
        if (!isPrinthouseAdmin) {
            setReadinessLoading(false);
            return;
        }

        let isMounted = true;
        const token = getAuthToken();

        fetch('/api/printhouse/onboarding', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (!isMounted) return;
            if (data?.ok && data?.data?.readiness) {
                const r = data.data.readiness;
                const accountComplete = r.accountSetup?.status === 'COMPLETE';
                const opsComplete = r.operationalConfiguration?.status === 'COMPLETE';
                const pricingComplete = r.pricingReadiness?.status === 'COMPLETE';
                setIsCoreSetupComplete(accountComplete && opsComplete && pricingComplete);
            } else {
                setFetchError(true);
            }
        })
        .catch(() => {
            if (isMounted) setFetchError(true);
        })
        .finally(() => {
            if (isMounted) setReadinessLoading(false);
        });

        return () => {
            isMounted = false;
        };
    }, [isPrinthouseAdmin]);

    // Unaffected roles (SUPER_ADMIN, VIEWER, etc.)
    if (!isPrinthouseAdmin) {
        return <>{children}</>;
    }

    if (readinessLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#09090b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
            }}>
                <RefreshCw size={32} className="animate-spin" style={{ color: '#dc0000' }} />
            </div>
        );
    }

    // Fail-safe for PRINTHOUSE_ADMIN: Incomplete or fetch error routes to /printhouse/setup
    if (!isCoreSetupComplete || fetchError) {
        return <Navigate to="/printhouse/setup" replace />;
    }

    return <>{children}</>;
};

