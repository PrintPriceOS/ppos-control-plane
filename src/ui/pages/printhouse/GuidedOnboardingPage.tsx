/**
 * src/ui/pages/printhouse/GuidedOnboardingPage.tsx
 *
 * Dedicated Guided Onboarding Page for PrintPrice Pro.
 * Accessible preview & production candidate route: /printhouse/onboarding-guided
 * Also accessible via tab/mode toggle from /printhouse/setup?mode=guided
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GuidedPrinthouseJourney } from '../../components/printhouse/onboarding/GuidedPrinthouseJourney';
import { getAuthToken, getUserPrinthouseId } from '../../lib/authStore';

export const GuidedOnboardingPage: React.FC = () => {
    const navigate = useNavigate();
    const [resolvedNodeId, setResolvedNodeId] = useState<string | null>(null);
    const [resolvedNodeName, setResolvedNodeName] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const resolveNode = async () => {
            const token = getAuthToken();
            const preferredNodeId = getUserPrinthouseId();
            try {
                const query = preferredNodeId ? `?nodeId=${encodeURIComponent(preferredNodeId)}` : '';
                const res = await fetch(`/api/printhouse/onboarding/pricing/industrial${query}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const json = await res.json();
                    if (isMounted && json?.ok && json?.data?.nodeId) {
                        setResolvedNodeId(json.data.nodeId);
                        setResolvedNodeName(json.data.nodeName || 'Primary Production Node');
                        return;
                    }
                }
            } catch (err) {
                console.debug('[GuidedOnboardingPage] Could not resolve node via industrial pricing endpoint:', err);
            }

            if (isMounted) {
                // If user claims provide a printhouseId / printerNodeId, use it; otherwise null (do NOT fall back to siteId)
                if (preferredNodeId) {
                    setResolvedNodeId(preferredNodeId);
                    setResolvedNodeName('Production Node');
                } else {
                    setResolvedNodeId(null);
                    setResolvedNodeName(null);
                }
            }
        };

        resolveNode();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleOpenFullSetup = (targetTab?: string) => {
        const query = targetTab && targetTab !== 'OVERVIEW' ? `?tab=${targetTab}` : '';
        navigate(`/printhouse/setup${query}`);
    };

    const handleComplete = () => {
        navigate('/printhouse/setup?tab=MARKETPLACE');
    };

    return (
        <GuidedPrinthouseJourney
            printerNodeId={resolvedNodeId || undefined}
            printerNodeName={resolvedNodeName || undefined}
            onOpenFullSetup={handleOpenFullSetup}
            onComplete={handleComplete}
        />
    );
};

