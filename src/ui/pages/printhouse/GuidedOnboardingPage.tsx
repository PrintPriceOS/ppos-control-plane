/**
 * src/ui/pages/printhouse/GuidedOnboardingPage.tsx
 *
 * Dedicated Guided Onboarding Page for PrintPrice Pro.
 * Accessible preview & production candidate route: /printhouse/onboarding-guided
 * Also accessible via tab/mode toggle from /printhouse/setup?mode=guided
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GuidedPrinthouseJourney } from '../../components/printhouse/onboarding/GuidedPrinthouseJourney';

export const GuidedOnboardingPage: React.FC = () => {
    const navigate = useNavigate();

    const handleOpenFullSetup = (targetTab?: string) => {
        const query = targetTab && targetTab !== 'OVERVIEW' ? `?tab=${targetTab}` : '';
        navigate(`/printhouse/setup${query}`);
    };

    const handleComplete = () => {
        navigate('/printhouse/setup?tab=MARKETPLACE');
    };

    return (
        <GuidedPrinthouseJourney
            onOpenFullSetup={handleOpenFullSetup}
            onComplete={handleComplete}
        />
    );
};
