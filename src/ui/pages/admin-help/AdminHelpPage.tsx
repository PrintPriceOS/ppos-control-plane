import React, { useEffect, useState } from 'react';
import { AdminHelpCenter } from './AdminHelpCenter';
import { AdminHelpArticle } from './AdminHelpArticle';

/**
 * AdminHelpPage Dispatcher
 * 
 * Switches between the Help Center (Search) and the specific Help Article 
 * based on the presence of the 'doc' query parameter.
 */
export const AdminHelpPage: React.FC = () => {
    const [hasDoc, setHasDoc] = useState(false);

    useEffect(() => {
        const checkParams = () => {
            const params = new URLSearchParams(window.location.search);
            setHasDoc(params.has('doc'));
        };

        checkParams();
        // Basic listener for popstate to handle local navigation without reload
        window.addEventListener('popstate', checkParams);
        return () => window.removeEventListener('popstate', checkParams);
    }, []);

    return hasDoc ? <AdminHelpArticle /> : <AdminHelpCenter />;
};
