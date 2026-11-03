import Fuse from 'fuse.js';
import { adminHelpDocs, HelpDoc } from '../data/adminKnowledgeBase';

const options = {
    keys: ['title', 'summary', 'keywords', 'category'],
    threshold: 0.3,
};

const fuse = new Fuse(adminHelpDocs, options);

export const searchHelpDocs = (query: string): HelpDoc[] => {
    if (!query) return adminHelpDocs;
    return fuse.search(query).map(result => result.item);
};

export const getHelpDocById = (id: string): HelpDoc | undefined => {
    let doc = adminHelpDocs.find(doc => doc.id === id);
    if (!doc && id.startsWith('error-')) {
        doc = adminHelpDocs.find(d => d.id === 'error-generic');
    }
    return doc;
};

export const getCategories = (): string[] => {
    const categories = new Set(adminHelpDocs.map(doc => doc.category));
    return Array.from(categories).sort();
};

export const getErrorArticleLink = (errorCode: string): string => {
    if (!errorCode || typeof errorCode !== 'string') return '/admin/help?doc=rb-pdf-2gb-timeout-recovery';

    const normalized = errorCode.toUpperCase().trim();
    if (normalized.includes('SPEND_CAP') || normalized.includes('402')) {
        return '/admin/help?doc=rb-resolve-402-spend-cap-paused';
    }
    if (normalized.includes('WEBHOOK') || normalized.includes('SIGNATURE')) {
        return '/admin/help?doc=rb-webhook-exponential-backoff';
    }
    if (normalized.includes('BLEED') || normalized.includes('TRIM')) {
        return '/admin/help?doc=pf-bleedbox-synthesis';
    }
    if (normalized.includes('SPINE') || normalized.includes('CALIPER')) {
        return '/admin/help?doc=pf-spine-caliper-math';
    }
    if (normalized.includes('TIMEOUT') || normalized.includes('GHOSTSCRIPT')) {
        return '/admin/help?doc=rb-pdf-2gb-timeout-recovery';
    }
    if (normalized.includes('SATURAT') || normalized.includes('ROUTING')) {
        return '/admin/help?doc=rb-plant-saturation-reroute';
    }

    const candidateId = `error-${normalized.toLowerCase().replace(/_/g, '-')}`;

    if (adminHelpDocs.some(doc => doc.id === candidateId)) {
        return `/admin/help?doc=${candidateId}`;
    }

    // Match partials prefixing
    const partialMatch = adminHelpDocs.find(doc =>
        doc.type === 'error' &&
        doc.id !== 'error-generic' &&
        normalized.includes(doc.id.replace('error-', '').replace(/-/g, '_').toUpperCase())
    );

    if (partialMatch) {
        return `/admin/help?doc=${partialMatch.id}`;
    }

    // Provide generic error id so the smart fallback banner is triggered
    return `/admin/help?doc=${candidateId}`;
};
