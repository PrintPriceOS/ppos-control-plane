import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminHelpCenter } from './AdminHelpCenter';
import { AdminHelpArticle } from './AdminHelpArticle';

/**
 * AdminHelpPage Dispatcher
 *
 * Switches between the Help Center (Search & Domain Taxonomy) and the specific
 * Help Article / Runbook based on the presence of the 'doc' query parameter.
 */
export const AdminHelpPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const docId = searchParams.get('doc') || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('doc') : null);

  return docId ? <AdminHelpArticle docId={docId} /> : <AdminHelpCenter />;
};
