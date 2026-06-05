import React, { useState } from 'react';
import { 
    CheckCircleIcon, 
    ExclamationTriangleIcon, 
    XCircleIcon, 
    InformationCircleIcon,
    DocumentArrowDownIcon,
    DocumentTextIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardDocumentIcon
} from '@heroicons/react/24/outline';
import { getAdminPreflightHumanReport, downloadAdminPreflightArtifact } from '../../lib/adminApi';
import { useAdminQuery } from '../../hooks/useAdminData';

interface HumanReportPanelProps {
    jobId: string;
}

export function HumanReportPanel({ jobId }: HumanReportPanelProps) {
    const { data: reportData, loading, error, refetch } = useAdminQuery(`human_report_${jobId}`, () => getAdminPreflightHumanReport(jobId));
    const [expandedTechnical, setExpandedTechnical] = useState(false);
    const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

    if (loading) {
        return <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-md p-6 h-48"></div>;
    }

    if (error || !reportData || !reportData.ok) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
                Failed to load Human Report: {error || reportData?.error || 'Unknown error'}
            </div>
        );
    }

    const {
        decision,
        outcome,
        severity,
        summary_title,
        customer_summary,
        operator_summary,
        technical_summary,
        recommended_next_action,
        artifact_recommendation,
        findings_summary,
        governance_summary
    } = reportData;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).catch(() => {});
    };

    const handleDownload = async (artifactId: string, filename: string) => {
        try {
            setDownloadingUrl(artifactId);
            const { download_url } = await downloadAdminPreflightArtifact(jobId, artifactId);
            
            const a = document.createElement('a');
            a.href = download_url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            console.error('Failed to download artifact:', err);
            alert('Failed to securely download artifact.');
        } finally {
            setDownloadingUrl(null);
        }
    };

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case 'success': return 'bg-green-50 border-green-200 text-green-800';
            case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
            case 'error': return 'bg-red-50 border-red-200 text-red-800';
            default: return 'bg-blue-50 border-blue-200 text-blue-800';
        }
    };

    const getSeverityIcon = (sev: string, className = "h-5 w-5") => {
        switch (sev) {
            case 'success': return <CheckCircleIcon className={`${className} text-green-500`} />;
            case 'warning': return <ExclamationTriangleIcon className={`${className} text-yellow-500`} />;
            case 'error': return <XCircleIcon className={`${className} text-red-500`} />;
            default: return <InformationCircleIcon className={`${className} text-blue-500`} />;
        }
    };

    const primaryActionColor = (sev: string) => {
        switch (sev) {
            case 'success': return 'bg-green-600 hover:bg-green-700 text-white border-transparent';
            case 'warning': return 'bg-yellow-600 hover:bg-yellow-700 text-white border-transparent';
            case 'error': return 'bg-red-600 hover:bg-red-700 text-white border-transparent';
            default: return 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent';
        }
    };

    const primaryArtifact = artifact_recommendation.primary_download_available ? reportData.artifacts.find((a: any) => a.recommended_use) : null;

    return (
        <div className={`rounded-lg border mb-6 shadow-sm overflow-hidden ${getSeverityColor(severity)}`}>
            {/* Header / Summary Card */}
            <div className="px-6 py-5 border-b border-opacity-20 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        {getSeverityIcon(severity, "h-6 w-6")}
                        <h2 className="text-lg font-semibold">{summary_title}</h2>
                    </div>
                    <p className="text-sm opacity-90 mb-4">{customer_summary}</p>
                    <button 
                        onClick={() => handleCopy(customer_summary)}
                        className="inline-flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity"
                    >
                        <ClipboardDocumentIcon className="h-3 w-3" /> Copy Customer Summary
                    </button>
                </div>

                {/* Recommended Next Action */}
                <div className="bg-white bg-opacity-60 dark:bg-black dark:bg-opacity-20 rounded-md p-4 min-w-[280px]">
                    <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-75">Recommended Action</div>
                    <div className="font-medium mb-1">{recommended_next_action.label}</div>
                    <div className="text-xs opacity-80 mb-3">{recommended_next_action.description}</div>
                    
                    {primaryArtifact ? (
                        <button
                            onClick={() => handleDownload(primaryArtifact.download_id, primaryArtifact.filename)}
                            disabled={downloadingUrl === primaryArtifact.download_id}
                            className={`w-full inline-flex justify-center items-center gap-2 px-3 py-2 border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${primaryActionColor(severity)} ${downloadingUrl === primaryArtifact.download_id ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {primaryArtifact.type === 'analysis_report' ? (
                                <DocumentTextIcon className="h-4 w-4" />
                            ) : (
                                <DocumentArrowDownIcon className="h-4 w-4" />
                            )}
                            {downloadingUrl === primaryArtifact.download_id ? 'Preparing...' : `Download ${primaryArtifact.label}`}
                        </button>
                    ) : (
                        outcome !== 'PROCESSING' && (
                            <button
                                disabled
                                className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 border rounded-md text-sm font-medium bg-gray-100 text-gray-500 cursor-not-allowed"
                            >
                                No Actions Available
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* Middle Section: Findings & Artifacts */}
            <div className="px-6 py-4 bg-white bg-opacity-40 dark:bg-black dark:bg-opacity-10 border-b border-opacity-20 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Findings Summary */}
                <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        Findings
                        {findings_summary.review_required && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Review Required
                            </span>
                        )}
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-red-50 text-red-800 rounded p-2 text-center border border-red-100">
                            <div className="text-lg font-bold">{findings_summary.critical_count}</div>
                            <div className="text-xs font-medium">Critical</div>
                        </div>
                        <div className="bg-yellow-50 text-yellow-800 rounded p-2 text-center border border-yellow-100">
                            <div className="text-lg font-bold">{findings_summary.warning_count}</div>
                            <div className="text-xs font-medium">Warnings</div>
                        </div>
                        <div className="bg-blue-50 text-blue-800 rounded p-2 text-center border border-blue-100">
                            <div className="text-lg font-bold">{findings_summary.info_count}</div>
                            <div className="text-xs font-medium">Info</div>
                        </div>
                    </div>
                </div>

                {/* Available Files */}
                <div>
                    <h3 className="text-sm font-semibold mb-3">Available Files</h3>
                    {reportData.artifacts.length === 0 ? (
                        <div className="text-sm opacity-70 italic">No files available.</div>
                    ) : (
                        <ul className="space-y-2">
                            {reportData.artifacts.map((artifact: any, idx: number) => (
                                <li key={idx} className="flex items-center justify-between text-sm bg-white bg-opacity-50 dark:bg-black dark:bg-opacity-20 px-3 py-2 rounded-md">
                                    <div className="flex items-center gap-2 truncate">
                                        <DocumentTextIcon className="h-4 w-4 opacity-70 flex-shrink-0" />
                                        <span className="truncate">{artifact.label} <span className="opacity-60 text-xs">({(artifact.size_bytes / 1024).toFixed(1)} KB)</span></span>
                                    </div>
                                    <button
                                        onClick={() => handleDownload(artifact.download_id, artifact.filename)}
                                        disabled={downloadingUrl === artifact.download_id}
                                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium ml-2 whitespace-nowrap text-xs"
                                    >
                                        Download
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Expandable Operator/Technical Details */}
            <div className="bg-white bg-opacity-20 dark:bg-black dark:bg-opacity-5">
                <button 
                    onClick={() => setExpandedTechnical(!expandedTechnical)}
                    className="w-full px-6 py-3 flex items-center justify-between text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
                >
                    Operator Details
                    {expandedTechnical ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                </button>
                
                {expandedTechnical && (
                    <div className="px-6 pb-5 space-y-4 text-sm opacity-90 border-t border-opacity-10 pt-4">
                        <div>
                            <span className="font-semibold block mb-1">Operator Summary:</span>
                            {operator_summary}
                            <button 
                                onClick={() => handleCopy(operator_summary)}
                                className="ml-3 inline-flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity text-indigo-600"
                            >
                                <ClipboardDocumentIcon className="h-3 w-3" /> Copy
                            </button>
                        </div>
                        <div>
                            <span className="font-semibold block mb-1">Technical Summary:</span>
                            {technical_summary}
                        </div>
                        <div className="flex items-center justify-between text-xs opacity-70 bg-black bg-opacity-5 p-2 rounded">
                            <span>Governance Event Count: {governance_summary.ledger_event_count}</span>
                            <span>Raw Logs Compacted: {governance_summary.compacted_count}</span>
                            <span className="truncate max-w-[150px]" title={governance_summary.trace_id}>Trace ID: {governance_summary.trace_id}</span>
                            <button onClick={() => refetch()} className="text-indigo-600 font-medium">Refresh Report</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
