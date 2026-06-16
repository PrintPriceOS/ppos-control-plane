import React from 'react';
import { Navigate } from 'react-router-dom';
import { getAuthUser } from '../../lib/authStore';

interface ActivationGuardProps {
    children: React.ReactNode;
}

export const ActivationGuard: React.FC<ActivationGuardProps> = ({ children }) => {
    const user = getAuthUser();

    // Check if the user is a printhouse admin that needs to complete the activation hub setup
    const isPrinthouseAdmin = user?.role === 'PRINTHOUSE_ADMIN';
    const isVerified = user?.metadata?.orchestration_status === 'VERIFIED';

    // If it's a printhouse admin and they aren't verified, redirect to activation hub
    if (isPrinthouseAdmin && !isVerified) {
        return <Navigate to="/activation-hub" replace />;
    }

    return <>{children}</>;
};
