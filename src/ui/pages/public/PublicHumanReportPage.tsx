import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { getArtifactUxForArtifact } from '../../../lib/artifactUx';
import { ReviewDecisionPanel } from '../../components/preflight/ReviewDecisionPanel';
import { CustomerRemediationPanel } from '../../components/preflight/CustomerRemediationPanel';
import { VisualProofPanel } from '../../components/preflight/VisualProofPanel';
import { ProofApprovalPanel } from '../../components/preflight/ProofApprovalPanel';

export const PublicHumanReportPage: React.FC = () => {
    const { token } = useParams<{ token: string }>();

    const [reportData, setReportData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchReport = async () => {
            try {
                const res = await fetch(`/api/public/preflight/human-report/${token}`);
                const data = await res.json();
                if (!data.ok) throw new Error(data.message || 'Failed to load report');
                if (isMounted) {
                    setReportData(data);
                    setIsLoading(false);
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err);
                    setIsError(true);
                    setIsLoading(false);
                }
            }
        };
        fetchReport();
        return () => { isMounted = false; };
    }, [token]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#131314] flex items-center justify-center font-manrope">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400 animate-pulse">Loading Report...</span>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#131314] flex items-center justify-center font-manrope">
                <div className="p-8 bg-white dark:bg-[#1E1E20] border border-red-500/20 text-center max-w-md">
                    <XCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 mb-2">Access Denied</h1>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-bold">{(error as any).message}</p>
                </div>
            </div>
        );
    }

    const { report } = reportData;
    const { outcome, severity, summary_title, customer_summary, artifact_recommendations } = report;

    const getSeverityTheme = (sev: string) => {
        switch (sev) {
            case 'success': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
            case 'warning': return 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400';
            case 'error': return 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400';
            case 'info': return 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400';
            default: return 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-400';
        }
    };

    const getSeverityIcon = (sev: string) => {
        switch (sev) {
            case 'success': return <CheckCircleIcon className="w-6 h-6" />;
            case 'warning': return <ExclamationTriangleIcon className="w-6 h-6" />;
            case 'error': return <XCircleIcon className="w-6 h-6" />;
            default: return <InformationCircleIcon className="w-6 h-6" />;
        }
    };

    const handleDownload = async (filename: string) => {
        // Since the public route doesn't have a download endpoint yet, 
        // they would need a presigned URL. 
        // For now, alert that they need to download from their portal.
        alert(`Downloading ${filename} will be supported via the Marketplace Portal.`);
    };

    const availableArtifacts = Object.values(artifact_recommendations || {});

    return (
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#131314] font-manrope py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto space-y-8">
                
                <div className="text-center">
                    <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900 dark:text-white">Preflight Review Report</h1>
                    <p className="mt-2 text-sm text-slate-500 font-bold">Ref: {report.job_id}</p>
                </div>

                <div className={`p-6 border rounded-none ${getSeverityTheme(severity)} flex gap-4 items-start`}>
                    <div className="shrink-0 mt-1">{getSeverityIcon(severity)}</div>
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-widest mb-3">{summary_title}</h2>
                        <p className="text-sm font-bold leading-relaxed opacity-90 whitespace-pre-wrap">{customer_summary}</p>
                    </div>
                </div>

                {report.review_decision_ux && report.review_decision_ux.customer && (
                    <ReviewDecisionPanel 
                        decisionUx={report.review_decision_ux.customer}
                        onActionClick={() => {}}
                        audience="customer"
                    />
                )}

                {report.remediation_ux && report.remediation_ux.customer && (
                    <CustomerRemediationPanel
                        remediationUx={report.remediation_ux.customer}
                        audience="customer"
                        onActionClick={() => alert('Customer actions would trigger here (e.g., upload flow)')}
                    />
                )}

                {/* Phase 69D: Visual Proof Panel (customer-safe view) */}
                {report.visual_diff_governance && (
                    <VisualProofPanel
                        visualDiffGovernance={report.visual_diff_governance}
                        audience="customer"
                    />
                )}

                {/* Phase 70D: Customer Proof Approval Panel (customer-safe view) */}
                {(report.proof_approval_governance || report.proof_approval_ux?.customer) && (
                    <ProofApprovalPanel
                        proofApprovalGovernance={report.proof_approval_governance}
                        proofApprovalUx={report.proof_approval_ux?.customer}
                        audience="customer"
                    />
                )}

                {availableArtifacts.length > 0 && (
                    <div className="bg-white dark:bg-[#1E1E20] border ppos-border p-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 mb-4">Available Files</h3>
                        <div className="space-y-4">
                            {availableArtifacts.map((art: any, idx) => {
                                const ux = getArtifactUxForArtifact(art, report.artifact_ux, 'customer');
                                return (
                                <div key={idx} className="flex items-center justify-between p-4 border ppos-border bg-slate-50 dark:bg-black/20">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-bold text-slate-800 dark:text-[#ECECF1]" title={ux.tooltip}>{ux.display_label || art.filename}</span>
                                        <span className={`text-[10px] uppercase font-black tracking-widest px-1.5 py-0.5 border inline-block w-fit ${
                                            ux.status_tone === 'danger' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                            ux.status_tone === 'warning' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                            ux.status_tone === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                            ux.status_tone === 'info' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                            'bg-slate-500/10 text-slate-500 border-slate-500/20'
                                        }`}>
                                            {ux.status_badge || art.role || 'Artifact'}
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => handleDownload(art.filename)}
                                        className="flex items-center gap-2 px-3 py-1.5 border border-primary text-primary hover:bg-primary/5 text-[10px] font-black uppercase tracking-widest transition-colors"
                                        title={ux.tooltip || 'Download this artifact'}
                                    >
                                        <ArrowDownTrayIcon className="w-4 h-4" />
                                        {ux.button_label || 'Download'}
                                    </button>
                                </div>
                            )})}
                        </div>
                    </div>
                )}
                
                <div className="text-center pt-8">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Powered by PrintPrice OS</p>
                </div>
            </div>
        </div>
    );
};
