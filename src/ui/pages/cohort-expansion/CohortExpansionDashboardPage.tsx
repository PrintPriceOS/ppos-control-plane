import React from 'react';

export const CohortExpansionDashboardPage: React.FC = () => {
    return (
        <div className="cohort-expansion-dashboard">
            <div className="mandatory-banner bg-yellow-100 text-yellow-800 p-4 font-bold">
                Expansion review is advisory/governed. It does not automatically expand public access.
            </div>
            <h1>Cohort Expansion Review Dashboard</h1>

            <ExpansionReviewListPanel />
            <ExpansionDecisionAuditPanel />
            <BetaHardeningTrackerPanel />
            <ExpansionApprovalGatingPanel />
            <ExpansionReadinessReportPanel />
            <CohortLimitAuditPanel />
        </div>
    );
};

export const ExpansionReviewListPanel: React.FC = () => <div>Review List</div>;
export const ExpansionDecisionAuditPanel: React.FC = () => <div>Decision Audit</div>;
export const BetaHardeningTrackerPanel: React.FC = () => <div>Hardening Tracker</div>;
export const ExpansionApprovalGatingPanel: React.FC = () => <div>Gating Results</div>;
export const ExpansionReadinessReportPanel: React.FC = () => <div>Readiness Report</div>;
export const CohortLimitAuditPanel: React.FC = () => <div>Cohort Audit</div>;
