// src/ui/pages/admin/MarketplacePrinthouseHandoffTab.tsx
import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    ArrowPathIcon,
    DocumentTextIcon,
    ShieldCheckIcon,
    XCircleIcon,
    CheckCircleIcon,
    QuestionMarkCircleIcon,
    ArchiveBoxIcon,
    ClockIcon,
    DocumentCheckIcon
} from "@heroicons/react/24/outline";

export const MarketplacePrinthouseHandoffTab: React.FC = () => {
    const [packages, setPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [detail, setDetail] = useState<any | null>(null);
    const [timeline, setTimeline] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // File Access State: { [fileId]: { token, tokenPreview, expiresAt, maxUses, descriptor, loading, error, fallbackMsg } }
    const [fileAccessState, setFileAccessState] = useState<Record<string, any>>({});

    const [actionState, setActionState] = useState<{ type: 'ACCEPT' | 'REJECT' | 'CLARIFY' | null, reason: string }>({ type: null, reason: '' });
    
    // Phase 38.4 Production Decision State
    const [productionStatus, setProductionStatus] = useState<any | null>(null);
    const [productionDecisionState, setProductionDecisionState] = useState<{ decision: string | null, reason: string }>({ decision: null, reason: '' });

    // Phase 38.5 Production Queue / Machine Assignment State
    const [queueStatus, setQueueStatus] = useState<any | null>(null);
    const [eligibility, setEligibility] = useState<any | null>(null);
    const [assignMachineId, setAssignMachineId] = useState<string>('');
    const [unassignReason, setUnassignReason] = useState<string>('');
    const [queueActionLoading, setQueueActionLoading] = useState<boolean>(false);

    // Phase 38.6 Production Work Order Execution State
    const [workOrderStatus, setWorkOrderStatus] = useState<any | null>(null);
    const [workOrderEligibility, setWorkOrderEligibility] = useState<any | null>(null);
    const [workOrderActionLoading, setWorkOrderActionLoading] = useState<boolean>(false);

    // Form inputs for Work Order
    const [woShiftId, setWoShiftId] = useState<string>('');
    const [woBatchRef, setWoBatchRef] = useState<string>('');
    const [woOperatorNote, setWoOperatorNote] = useState<string>('');
    const [woEstCompletion, setWoEstCompletion] = useState<string>('');
    const [woPauseReason, setWoPauseReason] = useState<string>('');
    const [woPauseNote, setWoPauseNote] = useState<string>('');
    const [woCancelReason, setWoCancelReason] = useState<string>('');
    const [woCancelNote, setWoCancelNote] = useState<string>('');

    // Phase 38.7 Production Progress State
    const [productionProgressStatus, setProductionProgressStatus] = useState<any | null>(null);
    const [productionProgressEligibility, setProductionProgressEligibility] = useState<any | null>(null);
    const [progressActionLoading, setProgressActionLoading] = useState<boolean>(false);

    // Form inputs for Production Progress
    const [progressPercent, setProgressPercent] = useState<string>('');
    const [progressMilestone, setProgressMilestone] = useState<string>('MATERIALS_STAGED');
    const [customMilestoneLabel, setCustomMilestoneLabel] = useState<string>('');
    const [progressNote, setProgressNote] = useState<string>('');
    const [progressForceRegression, setProgressForceRegression] = useState<boolean>(false);
    const [progressRegressionReason, setProgressRegressionReason] = useState<string>('');
    const [progressPauseReason, setProgressPauseReason] = useState<string>('');
    const [progressPauseNote, setProgressPauseNote] = useState<string>('');
    const [progressResumeNote, setProgressResumeNote] = useState<string>('');
    const [progressCompletionReadyNote, setProgressCompletionReadyNote] = useState<string>('');

    // Phase 38.8 states
    const [completionEligibility, setCompletionEligibility] = useState<any | null>(null);
    const [handoffReadiness, setHandoffReadiness] = useState<any | null>(null);
    const [completionActionLoading, setCompletionActionLoading] = useState<boolean>(false);
    const [handoffActionLoading, setHandoffActionLoading] = useState<boolean>(false);
    const [completionOverride, setCompletionOverride] = useState<boolean>(false);
    const [completionNote, setCompletionNote] = useState<string>('');
    const [completionOverrideReason, setCompletionOverrideReason] = useState<string>('');


    useEffect(() => {
        fetchPackages();
    }, []);

    const fetchPackages = async () => {
        setLoading(true);
        try {
            const res = await adminApi.listPrinthouseHandoffPackages();
            if (res.ok && res.packages) {
                setPackages(res.packages);
            } else {
                setPackages([]);
            }
        } catch (err) {
            console.error('Failed to fetch handoff packages:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadDetail = async (orderId: string) => {
        setSelectedOrderId(orderId);
        setDetailLoading(true);
        setActionState({ type: null, reason: '' });
        setProductionDecisionState({ decision: null, reason: '' });
        setAssignMachineId('');
        setUnassignReason('');
        
        setWoShiftId('');
        setWoBatchRef('');
        setWoOperatorNote('');
        setWoEstCompletion('');
        setWoPauseReason('');
        setWoPauseNote('');
        setWoCancelReason('');
        setWoCancelNote('');

        setProgressPercent('');
        setProgressMilestone('MATERIALS_STAGED');
        setCustomMilestoneLabel('');
        setProgressNote('');
        setProgressForceRegression(false);
        setProgressRegressionReason('');
        setProgressPauseReason('');
        setProgressPauseNote('');
        setProgressResumeNote('');
        setProgressCompletionReadyNote('');

        setCompletionOverride(false);
        setCompletionNote('');
        setCompletionOverrideReason('');

        try {
            const [pkgRes, timelineRes, prodRes, queueRes, evalRes, woRes, woEvalRes, progressRes, progressEvalRes, completionEligRes, handoffReadinessRes] = await Promise.all([
                adminApi.getPrinthouseHandoffPackage(orderId),
                adminApi.getPrinthouseHandoffTimeline(orderId),
                adminApi.getProductionDecisionStatus(orderId).catch(() => ({ ok: false })),
                adminApi.getProductionQueueStatus(orderId).catch(() => ({ ok: false })),
                adminApi.evaluateProductionQueue(orderId).catch(() => ({ ok: false })),
                adminApi.getProductionWorkOrderStatus(orderId).catch(() => ({ ok: false })),
                adminApi.evaluateProductionWorkOrder(orderId).catch(() => ({ ok: false })),
                adminApi.getProductionProgressStatus(orderId).catch(() => ({ ok: false })),
                adminApi.evaluateProductionProgress(orderId).catch(() => ({ ok: false })),
                adminApi.evaluateProductionCompletionEligibility(orderId).catch(() => ({ ok: false })),
                adminApi.evaluateDeliveryHandoffReadiness(orderId).catch(() => ({ ok: false }))
            ]);
            setDetail(pkgRes.ok ? pkgRes : null);
            setTimeline(timelineRes.ok ? timelineRes.timeline : []);
            setProductionStatus(prodRes.ok ? prodRes : null);
            setQueueStatus(queueRes.ok ? queueRes : null);
            setEligibility(evalRes.ok ? evalRes : null);
            setWorkOrderStatus(woRes.ok ? woRes : null);
            setWorkOrderEligibility(woEvalRes.ok ? woEvalRes : null);
            setProductionProgressStatus(progressRes.ok ? progressRes : null);
            setProductionProgressEligibility(progressEvalRes.ok ? progressEvalRes : null);
            setCompletionEligibility(completionEligRes.ok ? completionEligRes : null);
            setHandoffReadiness(handoffReadinessRes.ok ? handoffReadinessRes : null);
        } catch (err) {
            console.error('Failed to fetch package details', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const refreshTimeline = async () => {
        if (!selectedOrderId) return;
        try {
            const res = await adminApi.getPrinthouseHandoffTimeline(selectedOrderId);
            if (res.ok) setTimeline(res.timeline);
        } catch (e) {
            console.error('Failed to refresh timeline', e);
        }
    };

    const handleGenerateAccess = async (fileId: string) => {
        if (!selectedOrderId) return;
        setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: true, error: null } }));
        try {
            const res = await adminApi.createPrinthouseFileAccessToken(selectedOrderId, fileId);
            if (res.ok) {
                setFileAccessState(prev => ({
                    ...prev,
                    [fileId]: {
                        ...prev[fileId],
                        loading: false,
                        token: res.token,
                        tokenPreview: res.tokenPreview,
                        expiresAt: res.expiresAt,
                        maxUses: res.maxUses,
                        error: null
                    }
                }));
                await refreshTimeline();
            } else {
                setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false, error: res.error || 'Failed to generate token' } }));
            }
        } catch (err: any) {
            setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false, error: err.message } }));
        }
    };

    const handleCompleteProduction = async () => {
        if (!selectedOrderId) return;
        if (completionOverride && !completionOverrideReason.trim()) {
            alert("Break Glass Override requires a reason.");
            return;
        }
        setCompletionActionLoading(true);
        try {
            const res = await adminApi.completeProductionOrder(selectedOrderId, {
                overrideEligibility: completionOverride,
                operatorReason: completionOverride ? completionOverrideReason : undefined,
                note: completionNote
            });
            if (res.ok) {
                setCompletionNote('');
                setCompletionOverride(false);
                setCompletionOverrideReason('');
                await loadDetail(selectedOrderId);
            } else {
                alert(`Completion failed: ${res.message || res.error}`);
            }
        } catch (err: any) {
            alert(`Error completing production: ${err.message}`);
        } finally {
            setCompletionActionLoading(false);
        }
    };

    const handlePrepareDeliveryHandoff = async () => {
        if (!selectedOrderId) return;
        setHandoffActionLoading(true);
        try {
            const res = await adminApi.prepareDeliveryHandoff(selectedOrderId);
            if (res.ok) {
                await loadDetail(selectedOrderId);
            } else {
                alert(`Handoff preparation failed: ${res.message || res.error}`);
            }
        } catch (err: any) {
            alert(`Error preparing delivery handoff: ${err.message}`);
        } finally {
            setHandoffActionLoading(false);
        }
    };

    const handleViewDescriptor = async (fileId: string) => {
        if (!selectedOrderId) return;
        const state = fileAccessState[fileId];
        if (!state?.token) return;
        
        setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: true, error: null } }));
        try {
            const res = await adminApi.getPrinthouseFileDownloadDescriptor(selectedOrderId, fileId, state.token);
            if (res.ok) {
                setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false, descriptor: res } }));
                await refreshTimeline();
            } else {
                setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false, error: res.error || 'Failed to get descriptor' } }));
            }
        } catch (err: any) {
            setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false, error: err.message } }));
        }
    };

    const handleDownload = async (fileId: string, originalName: string) => {
        if (!selectedOrderId) return;
        const state = fileAccessState[fileId];
        if (!state?.token) return;

        setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: true, error: null, fallbackMsg: null } }));
        try {
            const res = await adminApi.downloadPrinthouseFile(selectedOrderId, fileId, state.token);
            if (res.ok && res.blob) {
                // Actual download
                const url = window.URL.createObjectURL(res.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = originalName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false } }));
            } else if (res.error === 'FILE_STREAMING_NOT_CONFIGURED') {
                setFileAccessState(prev => ({ 
                    ...prev, 
                    [fileId]: { 
                        ...prev[fileId], 
                        loading: false, 
                        fallbackMsg: "Secure file access validated. Physical streaming is not enabled yet for this environment.",
                        descriptor: res.descriptor || prev[fileId].descriptor
                    } 
                }));
            } else {
                setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false, error: res.error || 'Download failed' } }));
            }
            await refreshTimeline();
        } catch (err: any) {
            setFileAccessState(prev => ({ ...prev, [fileId]: { ...prev[fileId], loading: false, error: err.message } }));
            await refreshTimeline();
        }
    };

    const handleAction = async () => {
        if (!selectedOrderId || !actionState.type) return;

        try {
            let res;
            if (actionState.type === 'ACCEPT') {
                res = await adminApi.acceptPrinthouseHandoff(selectedOrderId, { note: actionState.reason });
            } else if (actionState.type === 'REJECT') {
                if (!actionState.reason) return alert('Reason is required');
                res = await adminApi.rejectPrinthouseHandoff(selectedOrderId, { reason: actionState.reason });
            } else if (actionState.type === 'CLARIFY') {
                if (!actionState.reason) return alert('Message is required');
                res = await adminApi.requestHandoffClarification(selectedOrderId, { message: actionState.reason });
            }

            if (res?.ok) {
                setActionState({ type: null, reason: '' });
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Action failed: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleProductionDecision = async () => {
        if (!selectedOrderId || !productionDecisionState.decision) return;
        const { decision, reason } = productionDecisionState;
        if ((decision === 'PRODUCTION_HOLD' || decision === 'PRODUCTION_REJECTED') && !reason) {
            return alert('Reason is required for Hold or Reject.');
        }

        try {
            const res = await adminApi.recordProductionDecision(selectedOrderId, decision, reason);
            if (res?.ok) {
                setProductionDecisionState({ decision: null, reason: '' });
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Decision failed: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleCreateQueueEntry = async (machineIdOption?: string) => {
        if (!selectedOrderId) return;
        setQueueActionLoading(true);
        try {
            const res = await adminApi.createProductionQueueEntry(selectedOrderId, { machineId: machineIdOption || undefined });
            if (res?.ok) {
                setAssignMachineId('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to queue order: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setQueueActionLoading(false);
        }
    };

    const handleAssignMachine = async () => {
        if (!selectedOrderId) return;
        if (!assignMachineId.trim()) {
            return alert('Machine ID is required');
        }
        setQueueActionLoading(true);
        try {
            const res = await adminApi.assignProductionMachine(selectedOrderId, assignMachineId.trim());
            if (res?.ok) {
                setAssignMachineId('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to assign machine: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setQueueActionLoading(false);
        }
    };

    const handleUnassignMachine = async () => {
        if (!selectedOrderId) return;
        setQueueActionLoading(true);
        try {
            const res = await adminApi.unassignProductionMachine(selectedOrderId, { reason: unassignReason.trim() });
            if (res?.ok) {
                setUnassignReason('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to unassign machine: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setQueueActionLoading(false);
        }
    };

    const handleCreateWorkOrder = async () => {
        if (!selectedOrderId) return;
        setWorkOrderActionLoading(true);
        try {
            const res = await adminApi.createProductionWorkOrder(selectedOrderId);
            if (res?.ok) {
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to create work order: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setWorkOrderActionLoading(false);
        }
    };

    const handleStartWorkOrder = async () => {
        if (!selectedOrderId) return;
        setWorkOrderActionLoading(true);
        try {
            const res = await adminApi.startProductionWorkOrder(selectedOrderId, {
                shiftId: woShiftId.trim() || undefined,
                batchReference: woBatchRef.trim() || undefined,
                operatorNote: woOperatorNote.trim() || undefined,
                estimatedCompletionAt: woEstCompletion.trim() || undefined
            });
            if (res?.ok) {
                setWoShiftId('');
                setWoBatchRef('');
                setWoOperatorNote('');
                setWoEstCompletion('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to start work order: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setWorkOrderActionLoading(false);
        }
    };

    const handlePauseWorkOrder = async () => {
        if (!selectedOrderId) return;
        if (!woPauseReason.trim()) {
            return alert('Pause reason is required');
        }
        setWorkOrderActionLoading(true);
        try {
            const res = await adminApi.pauseProductionWorkOrder(selectedOrderId, {
                reason: woPauseReason.trim(),
                note: woPauseNote.trim() || undefined
            });
            if (res?.ok) {
                setWoPauseReason('');
                setWoPauseNote('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to pause work order: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setWorkOrderActionLoading(false);
        }
    };

    const handleResumeWorkOrder = async () => {
        if (!selectedOrderId) return;
        setWorkOrderActionLoading(true);
        try {
            const res = await adminApi.resumeProductionWorkOrder(selectedOrderId, {
                note: woOperatorNote.trim() || undefined
            });
            if (res?.ok) {
                setWoOperatorNote('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to resume work order: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setWorkOrderActionLoading(false);
        }
    };

    const handleCancelWorkOrder = async () => {
        if (!selectedOrderId) return;
        if (!woCancelReason.trim()) {
            return alert('Cancel reason is required');
        }
        setWorkOrderActionLoading(true);
        try {
            const res = await adminApi.cancelProductionWorkOrder(selectedOrderId, {
                reason: woCancelReason.trim(),
                note: woCancelNote.trim() || undefined
            });
            if (res?.ok) {
                setWoCancelReason('');
                setWoCancelNote('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to cancel work order: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setWorkOrderActionLoading(false);
        }
    };

    const handleRecordProgress = async () => {
        if (!selectedOrderId) return;
        const percent = parseInt(progressPercent, 10);
        if (isNaN(percent) || percent < 0 || percent > 99) {
            return alert('Progress percentage must be between 0 and 99');
        }
        if (!progressMilestone) {
            return alert('Milestone is required');
        }
        if (progressMilestone === 'CUSTOM' && !customMilestoneLabel.trim()) {
            return alert('Custom milestone label is required');
        }
        if (percent < (productionProgressStatus?.productionProgress?.progressPercent || 0)) {
            if (!progressForceRegression) {
                return alert('Progress regression is blocked unless forced with a reason');
            }
            if (!progressRegressionReason.trim()) {
                return alert('Regression reason is required to force a progress regression');
            }
        }

        setProgressActionLoading(true);
        try {
            const res = await adminApi.recordProductionProgress(selectedOrderId, {
                progressPercent: percent,
                milestone: progressMilestone,
                customMilestoneLabel: progressMilestone === 'CUSTOM' ? customMilestoneLabel.trim() : undefined,
                note: progressNote.trim() || undefined,
                forceRegression: progressForceRegression || undefined,
                reason: progressForceRegression ? progressRegressionReason.trim() : undefined
            });
            if (res?.ok) {
                setProgressPercent('');
                setCustomMilestoneLabel('');
                setProgressNote('');
                setProgressForceRegression(false);
                setProgressRegressionReason('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to record progress: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setProgressActionLoading(false);
        }
    };

    const handlePauseProgress = async () => {
        if (!selectedOrderId) return;
        if (!progressPauseReason.trim()) {
            return alert('Pause reason is required');
        }
        setProgressActionLoading(true);
        try {
            const res = await adminApi.pauseProductionProgress(selectedOrderId, {
                reason: progressPauseReason.trim(),
                note: progressPauseNote.trim() || undefined
            });
            if (res?.ok) {
                setProgressPauseReason('');
                setProgressPauseNote('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to pause production: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setProgressActionLoading(false);
        }
    };

    const handleResumeProgress = async () => {
        if (!selectedOrderId) return;
        setProgressActionLoading(true);
        try {
            const res = await adminApi.resumeProductionProgress(selectedOrderId, {
                note: progressResumeNote.trim() || undefined
            });
            if (res?.ok) {
                setProgressResumeNote('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to resume production: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setProgressActionLoading(false);
        }
    };

    const handleMarkCompletionReady = async () => {
        if (!selectedOrderId) return;
        setProgressActionLoading(true);
        try {
            const res = await adminApi.markProductionCompletionReady(selectedOrderId, {
                note: progressCompletionReadyNote.trim() || undefined
            });
            if (res?.ok) {
                setProgressCompletionReadyNote('');
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Failed to mark completion ready: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setProgressActionLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PRINTHOUSE_ACCEPTED': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
            case 'PRINTHOUSE_REJECTED': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
            case 'CLARIFICATION_REQUESTED': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
            case 'PRINTHOUSE_HANDOFF_READY':
            case 'DISPATCH_PACKAGE_CREATED': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20';
            default: return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10';
        }
    };

    const formatDate = (isoStr?: string) => {
        if (!isoStr) return '—';
        return new Date(isoStr).toLocaleString();
    };

    return (
        <div className="flex flex-col lg:flex-row h-full min-h-[600px] border border-slate-200 dark:border-white/10 animate-slide-fade">
            {/* Left Panel: Dense Table */}
            <div className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-[#131314] ${selectedOrderId ? 'hidden lg:flex lg:w-1/2 xl:w-2/3 border-r border-slate-200 dark:border-white/10' : ''}`}>
                <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <ArchiveBoxIcon className="w-5 h-5 text-primary" />
                        <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Handoff Packages</h2>
                    </div>
                    <button onClick={fetchPackages} className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 transition-colors">
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    {loading ? (
                        <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Loading packages...</div>
                    ) : packages.length === 0 ? (
                        <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No handoff packages found</div>
                    ) : (
                        <table className="w-full text-left text-[11px] whitespace-nowrap">
                            <thead className="bg-slate-50 dark:bg-white/5 sticky top-0 uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Status</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Package ID</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Order ID</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Printhouse</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Files</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
                                {packages.map(pkg => (
                                    <tr 
                                        key={pkg.packageId} 
                                        onClick={() => loadDetail(pkg.orderId)}
                                        className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${selectedOrderId === pkg.orderId ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                                    >
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border ${getStatusColor(pkg.dispatchStatus)}`}>
                                                {pkg.dispatchStatus?.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 font-mono text-[10px]">{pkg.packageId}</td>
                                        <td className="px-4 py-2 font-mono text-[10px]">{pkg.orderId}</td>
                                        <td className="px-4 py-2 uppercase truncate max-w-[150px]">{pkg.printhouse?.name || pkg.printhouse?.id || '—'}</td>
                                        <td className="px-4 py-2">{pkg.files?.length || 0}</td>
                                        <td className="px-4 py-2 text-slate-500">{formatDate(pkg.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Right Panel: Forensic Drawer */}
            {selectedOrderId && (
                <div className="flex-1 lg:w-1/2 xl:w-1/3 flex flex-col bg-white dark:bg-[#131314] min-w-0">
                    <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-white/5">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest truncate mr-4">
                            Package Detail
                        </h3>
                        <button onClick={() => setSelectedOrderId(null)} className="text-slate-400 hover:text-slate-600 lg:hidden">
                            <XCircleIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-6">
                        {detailLoading ? (
                            <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mt-10">Loading detail...</div>
                        ) : !detail ? (
                            <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mt-10">Failed to load package</div>
                        ) : (
                            <>
                                {/* Header Summary */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Order ID</div>
                                            <div className="font-mono text-xs text-slate-900 dark:text-white">{detail.orderId}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Package ID</div>
                                            <div className="font-mono text-xs text-slate-900 dark:text-white">{detail.packageId}</div>
                                        </div>
                                    </div>
                                    <span className={`inline-block px-2 py-1 text-[10px] font-black uppercase tracking-widest border ${getStatusColor(detail.status)}`}>
                                        {detail.status?.replace(/_/g, ' ')}
                                    </span>
                                </div>

                                {/* Printhouse & Operations */}
                                <div className="border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-white/5 space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-white/10 pb-1 mb-2">Printhouse Assignment</h4>
                                    <div className="text-xs font-medium text-slate-900 dark:text-white">{detail.manifest?.printhouse?.name || detail.manifest?.printhouse?.id}</div>
                                </div>

                                {/* Files */}
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                        <DocumentCheckIcon className="w-3.5 h-3.5" /> Production Files
                                    </h4>
                                    
                                    {(detail.status === 'PRINTHOUSE_REJECTED' || detail.status === 'CLARIFICATION_REQUESTED' || detail.handoffStatus === 'REJECTED' || detail.handoffStatus === 'CLARIFICATION_REQUESTED') && (
                                        <div className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-500/10 p-2 font-bold uppercase tracking-widest">
                                            File access disabled until handoff is accepted or clarification is resolved.
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {detail.manifest?.files?.map((f: any, i: number) => {
                                            const fState = fileAccessState[f.fileId] || {};
                                            const isEligible = !['PRINTHOUSE_REJECTED', 'CLARIFICATION_REQUESTED'].includes(detail.status) && !['REJECTED', 'CLARIFICATION_REQUESTED'].includes(detail.handoffStatus) && f.status !== 'SUPERSEDED';
                                            
                                            return (
                                                <div key={i} className="border border-slate-200 dark:border-white/10 p-2 flex flex-col gap-1 text-[11px]">
                                                    <div className="flex justify-between">
                                                        <span className="font-black text-slate-900 dark:text-white uppercase">{f.role}</span>
                                                        <span className="text-slate-500 font-mono">{f.checksum?.substring(0,8) || '—'}</span>
                                                    </div>
                                                    <div className="text-slate-600 dark:text-slate-400 truncate">{f.originalName}</div>
                                                    {f.storagePath && (
                                                        <div className="text-primary font-mono truncate text-[9px] mt-1 bg-primary/5 p-1">
                                                            {f.storagePath}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[9px] uppercase font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-1">
                                                            {f.preflightStatus}
                                                        </span>
                                                        {f.findingsCount > 0 && <span className="text-[9px] uppercase font-bold text-amber-600">Findings: {f.findingsCount}</span>}
                                                    </div>
                                                    
                                                    {isEligible && (
                                                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                                                            {!fState.token && !fState.loading && (
                                                                <button 
                                                                    onClick={() => handleGenerateAccess(f.fileId)}
                                                                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 transition-colors"
                                                                >
                                                                    Generate Access
                                                                </button>
                                                            )}
                                                            
                                                            {fState.loading && <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Loading...</div>}
                                                            
                                                            {fState.error && <div className="text-[10px] text-red-500 font-bold uppercase tracking-widest">{fState.error}</div>}
                                                            
                                                            {fState.token && !fState.loading && (
                                                                <div className="space-y-2">
                                                                    <div className="flex flex-wrap gap-2 text-[9px] font-mono text-slate-500">
                                                                        <span className="bg-slate-100 dark:bg-white/5 px-1">{fState.tokenPreview}</span>
                                                                        <span>Exp: {formatDate(new Date(fState.expiresAt).toISOString())}</span>
                                                                        <span>Max Uses: {fState.maxUses}</span>
                                                                    </div>
                                                                    
                                                                    <div className="flex gap-2">
                                                                        {!fState.descriptor && (
                                                                            <button 
                                                                                onClick={() => handleViewDescriptor(f.fileId)}
                                                                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 transition-colors"
                                                                            >
                                                                                View Secure Descriptor
                                                                            </button>
                                                                        )}
                                                                        
                                                                        <button 
                                                                            onClick={() => handleDownload(f.fileId, f.originalName)}
                                                                            className="px-3 py-1 bg-primary text-white hover:bg-primary/90 text-[10px] font-black uppercase tracking-widest transition-colors"
                                                                        >
                                                                            Verify Governed Download
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    {fState.fallbackMsg && (
                                                                        <div className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 p-2 border border-emerald-200 dark:border-emerald-500/20 font-bold">
                                                                            {fState.fallbackMsg}
                                                                        </div>
                                                                    )}
                                                                    
                                                                    {fState.descriptor && (
                                                                        <div className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 p-2 font-mono text-[9px] text-slate-600 dark:text-slate-400 overflow-x-auto">
                                                                            <pre>
                                                                                {JSON.stringify(
                                                                                    {
                                                                                        ...fState.descriptor,
                                                                                        downloadUrl: fState.descriptor.downloadUrl?.replace(/token=pfat_[a-zA-Z0-9]+/, `token=${fState.tokenPreview}`)
                                                                                    },
                                                                                    null,
                                                                                    2
                                                                                )}
                                                                            </pre>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Timeline */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                        <ClockIcon className="w-3.5 h-3.5" /> Operational Timeline
                                    </h4>
                                    <div className="pl-3 border-l-2 border-slate-200 dark:border-white/10 space-y-4">
                                        {timeline.map((ev, i) => (
                                            <div key={i} className="relative">
                                                <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                                                <div className="text-[10px] text-slate-400 font-mono">{formatDate(ev.created_at)}</div>
                                                <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">{ev.event_type}</div>
                                                {ev.source === 'metadata_fallback' && (
                                                    <div className="text-[9px] text-amber-600 uppercase font-bold mt-0.5">Synthetic Fallback</div>
                                                )}
                                                {ev.payload?.tokenPreview && <div className="text-[10px] font-mono text-primary mt-1">{ev.payload.tokenPreview}</div>}
                                                {ev.payload?.decision && <div className="text-[10px] text-indigo-500 mt-1 font-bold">Decision: {ev.payload.decision}</div>}
                                                {ev.payload?.reason && <div className="text-[10px] text-red-500 mt-1">Reason: {ev.payload.reason}</div>}
                                                {ev.payload?.message && <div className="text-[10px] text-amber-500 mt-1">Msg: {ev.payload.message}</div>}
                                            </div>
                                        ))}
                                        {timeline.length === 0 && <div className="text-xs text-slate-400">No events found</div>}
                                    </div>
                                </div>

                                {/* Phase 38.4 - Production Decision Gate */}
                                {detail && ['PRINTHOUSE_ACCEPTED', 'READY_FOR_PRODUCTION', 'PRODUCTION_HOLD', 'PRODUCTION_REJECTED', 'PRODUCTION_ACCEPTED'].includes(detail.status || detail.handoffStatus) && (
                                    <div className="mt-8 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-4">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                                            <DocumentCheckIcon className="w-4 h-4 text-indigo-500" />
                                            Production Decision Gate
                                        </h4>
                                        
                                        {productionStatus && productionStatus.warnings?.includes('FILE_ACCESS_NOT_VERIFIED_BY_AUDIT') && (
                                            <div className="mb-4 p-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                                                <QuestionMarkCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                                                <div>
                                                    <strong>FILE_ACCESS_NOT_VERIFIED_BY_AUDIT</strong><br/>
                                                    No verified file downloads found in audit logs. Proceed with caution.
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                                            <div>
                                                <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Current Order Status</div>
                                                <div className="font-mono text-slate-900 dark:text-white">{productionStatus?.orderStatus || '—'}</div>
                                            </div>
                                            <div>
                                                <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Production Decision</div>
                                                <div className="font-mono text-indigo-600 dark:text-indigo-400">{productionStatus?.productionDecision?.decision || 'PENDING'}</div>
                                            </div>
                                            {productionStatus?.productionDecision?.decidedAt && (
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Decided At</div>
                                                    <div className="font-mono text-slate-900 dark:text-white">{formatDate(productionStatus.productionDecision.decidedAt)}</div>
                                                </div>
                                            )}
                                            {productionStatus?.productionDecision?.decidedBy && (
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Decided By</div>
                                                    <div className="font-mono text-slate-900 dark:text-white">{productionStatus.productionDecision.decidedBy}</div>
                                                </div>
                                            )}
                                            {productionStatus?.productionDecision?.reason && (
                                                <div className="col-span-2">
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Reason</div>
                                                    <div className="p-2 bg-white dark:bg-white/5 text-red-600 dark:text-red-400 border border-slate-200 dark:border-white/10 font-mono">
                                                        {productionStatus.productionDecision.reason}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {productionStatus?.orderStatus !== 'PRODUCTION_ACCEPTED' && (
                                            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/10">
                                                <div className="flex gap-2">
                                                    <select 
                                                        className="flex-1 bg-white dark:bg-[#131314] border border-slate-300 dark:border-white/20 text-xs p-2 text-slate-900 dark:text-white"
                                                        value={productionDecisionState.decision || ''}
                                                        onChange={(e) => setProductionDecisionState({ ...productionDecisionState, decision: e.target.value })}
                                                    >
                                                        <option value="" disabled>Select Decision...</option>
                                                        <option value="READY_FOR_PRODUCTION">Mark Ready for Production</option>
                                                        <option value="PRODUCTION_ACCEPTED">Accept into Production Queue</option>
                                                        <option value="PRODUCTION_HOLD">Put on Hold</option>
                                                        <option value="PRODUCTION_REJECTED">Reject Production</option>
                                                    </select>
                                                </div>
                                                
                                                {(productionDecisionState.decision === 'PRODUCTION_HOLD' || productionDecisionState.decision === 'PRODUCTION_REJECTED' || productionDecisionState.decision === 'READY_FOR_PRODUCTION' || productionDecisionState.decision === 'PRODUCTION_ACCEPTED') && (
                                                    <div className="flex gap-2 items-start animate-slide-fade">
                                                        <textarea 
                                                            className="flex-1 h-20 bg-white dark:bg-[#131314] border border-slate-300 dark:border-white/20 p-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                                                            placeholder={(productionDecisionState.decision === 'PRODUCTION_HOLD' || productionDecisionState.decision === 'PRODUCTION_REJECTED') ? "Reason (Required)..." : "Reason (Optional)..."}
                                                            value={productionDecisionState.reason}
                                                            onChange={e => setProductionDecisionState({ ...productionDecisionState, reason: e.target.value })}
                                                        />
                                                        <button 
                                                            onClick={handleProductionDecision}
                                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors h-20"
                                                        >
                                                            Submit
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Phase 38.5 - Production Queue / Machine Assignment Gate */}
                                {detail && ['PRODUCTION_ACCEPTED', 'PRODUCTION_QUEUED', 'MACHINE_ASSIGNED'].includes(detail.status || detail.handoffStatus || (productionStatus && productionStatus.orderStatus) || (queueStatus && queueStatus.orderStatus)) && (
                                    <div className="mt-8 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-4 animate-slide-fade">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                                            <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                                            Production Queue Gate
                                        </h4>

                                        {/* Warnings & Blockers */}
                                        {eligibility && !queueStatus?.productionQueue && (
                                            <div className="mb-4 space-y-2">
                                                {eligibility.blockers && eligibility.blockers.length > 0 && (
                                                    <div className="p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Queue Creation Blocked</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {eligibility.blockers.map((b: string) => <li key={b}>{b}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                                {eligibility.warnings && eligibility.warnings.length > 0 && (
                                                    <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Warnings</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {eligibility.warnings.map((w: string) => <li key={w}>{w}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {queueStatus?.productionQueue?.warnings && queueStatus.productionQueue.warnings.length > 0 && (
                                            <div className="mb-4 p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                                                <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Queue Entry Warnings</strong>
                                                <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                    {queueStatus.productionQueue.warnings.map((w: string) => <li key={w}>{w}</li>)}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Status Info */}
                                        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                                            <div>
                                                <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Queue Status</div>
                                                <span className={`inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border ${
                                                    queueStatus?.productionQueue?.status === 'MACHINE_ASSIGNED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                    queueStatus?.productionQueue?.status === 'PRODUCTION_QUEUED' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400' :
                                                    'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400'
                                                }`}>
                                                    {queueStatus?.productionQueue?.status || 'NOT QUEUED'}
                                                </span>
                                            </div>

                                            {queueStatus?.productionQueue?.queuedAt && (
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Queued At</div>
                                                    <div className="font-mono text-slate-900 dark:text-white">{formatDate(queueStatus.productionQueue.queuedAt)}</div>
                                                </div>
                                            )}

                                            {queueStatus?.productionQueue?.queuedBy && (
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Queued By</div>
                                                    <div className="font-mono text-slate-900 dark:text-white truncate">{queueStatus.productionQueue.queuedBy}</div>
                                                </div>
                                            )}

                                            {queueStatus?.productionQueue?.machineAssignment && (
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Machine Assignment</div>
                                                    <span className={`inline-block px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border ${
                                                        queueStatus.productionQueue.machineAssignment.assignmentStatus === 'ASSIGNED' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-white/5 font-bold'
                                                    }`}>
                                                        {queueStatus.productionQueue.machineAssignment.assignmentStatus}
                                                    </span>
                                                </div>
                                            )}

                                            {queueStatus?.productionQueue?.machineAssignment?.assignmentStatus === 'ASSIGNED' && (
                                                <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-slate-200 dark:border-white/5 pt-2 mt-2">
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Machine ID</div>
                                                        <div className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{queueStatus.productionQueue.machineAssignment.machineId}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Assigned At</div>
                                                        <div className="font-mono text-slate-900 dark:text-white">{formatDate(queueStatus.productionQueue.machineAssignment.assignedAt)}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/10">
                                            {/* Queue Creation Action */}
                                            {!queueStatus?.productionQueue && (
                                                <div className="space-y-3">
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="text"
                                                            placeholder="Optional Machine ID..."
                                                            className="flex-1 bg-white dark:bg-[#131314] border border-slate-300 dark:border-white/20 text-xs p-2 text-slate-900 dark:text-white font-mono"
                                                            value={assignMachineId}
                                                            onChange={e => setAssignMachineId(e.target.value)}
                                                            disabled={queueActionLoading || (eligibility && !eligibility.eligible)}
                                                        />
                                                        <button 
                                                            onClick={() => handleCreateQueueEntry(assignMachineId.trim() || undefined)}
                                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                            disabled={queueActionLoading || (eligibility && !eligibility.eligible)}
                                                        >
                                                            {queueActionLoading ? 'Queueing...' : 'Create Queue Entry'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Machine Assignment / Re-assignment Action */}
                                            {queueStatus?.productionQueue && (
                                                <div className="space-y-3">
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="text"
                                                            placeholder="Enter Machine ID..."
                                                            className="flex-1 bg-white dark:bg-[#131314] border border-slate-300 dark:border-white/20 text-xs p-2 text-slate-900 dark:text-white font-mono"
                                                            value={assignMachineId}
                                                            onChange={e => setAssignMachineId(e.target.value)}
                                                            disabled={queueActionLoading}
                                                        />
                                                        <button 
                                                            onClick={handleAssignMachine}
                                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                            disabled={queueActionLoading}
                                                        >
                                                            {queueActionLoading ? 'Assigning...' : queueStatus.productionQueue.machineAssignment?.assignmentStatus === 'ASSIGNED' ? 'Reassign Machine' : 'Assign Machine'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Machine Unassignment Action */}
                                            {queueStatus?.productionQueue?.machineAssignment?.assignmentStatus === 'ASSIGNED' && (
                                                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
                                                    <div className="flex gap-2 items-start">
                                                        <textarea 
                                                            placeholder="Unassign Reason (Optional)..."
                                                            className="flex-1 h-16 bg-white dark:bg-[#131314] border border-slate-300 dark:border-white/20 p-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                                                            value={unassignReason}
                                                            onChange={e => setUnassignReason(e.target.value)}
                                                            disabled={queueActionLoading}
                                                        />
                                                        <button 
                                                            onClick={handleUnassignMachine}
                                                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest transition-colors h-16 disabled:opacity-50"
                                                            disabled={queueActionLoading}
                                                        >
                                                            {queueActionLoading ? 'Unassigning...' : 'Unassign Machine'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Phase 38.6 - Production Start / Work Order Execution Gate */}
                                {detail && ['MACHINE_ASSIGNED', 'WORK_ORDER_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_PAUSED', 'PRODUCTION_CANCELLED'].includes(detail.status || detail.handoffStatus || (productionStatus && productionStatus.orderStatus) || (workOrderStatus && workOrderStatus.orderStatus)) && (
                                    <div className="mt-8 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-4 animate-slide-fade">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                                            <ClockIcon className="w-4 h-4 text-indigo-500" />
                                            Work Order Execution Gate
                                        </h4>

                                        {/* Blockers & Warnings */}
                                        {workOrderEligibility && !workOrderStatus?.productionWorkOrder && (
                                            <div className="space-y-3 mb-4">
                                                {workOrderEligibility.blockers && workOrderEligibility.blockers.length > 0 && (
                                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Work Order Blocked</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {workOrderEligibility.blockers.map((b: string) => <li key={b}>{b}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                                {workOrderEligibility.warnings && workOrderEligibility.warnings.length > 0 && (
                                                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Eligibility Warnings</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {workOrderEligibility.warnings.map((w: string) => <li key={w}>{w}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Current Status display */}
                                        {workOrderStatus?.productionWorkOrder && (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Work Order Status</div>
                                                        <span className={`inline-block px-2 py-0.5 border text-[9px] uppercase tracking-wider font-mono ${
                                                            workOrderStatus.productionWorkOrder.status === 'PRODUCTION_STARTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                                                            workOrderStatus.productionWorkOrder.status === 'PRODUCTION_PAUSED' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' :
                                                            workOrderStatus.productionWorkOrder.status === 'PRODUCTION_CANCELLED' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                                                            'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                                                        }`}>
                                                            {workOrderStatus.productionWorkOrder.status}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Work Order ID</div>
                                                        <div className="font-mono text-xs text-slate-900 dark:text-white truncate font-bold">{workOrderStatus.productionWorkOrder.workOrderId}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Machine ID</div>
                                                        <div className="font-mono text-xs text-slate-900 dark:text-white font-bold">{workOrderStatus.productionWorkOrder.machineId || '—'}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Created At</div>
                                                        <div className="font-mono text-xs text-slate-900 dark:text-white">{formatDate(workOrderStatus.productionWorkOrder.createdAt)}</div>
                                                    </div>
                                                </div>

                                                {/* Start details if started */}
                                                {workOrderStatus.productionWorkOrder.start && (
                                                    <div className="p-3 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 space-y-2">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Execution Parameters</strong>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div>
                                                                <span className="text-slate-400 dark:text-slate-500 text-[9px] block">Started At</span>
                                                                <span className="font-mono">{formatDate(workOrderStatus.productionWorkOrder.start.startedAt)}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400 dark:text-slate-500 text-[9px] block">Started By</span>
                                                                <span className="font-mono truncate block">{workOrderStatus.productionWorkOrder.start.startedBy}</span>
                                                            </div>
                                                            {workOrderStatus.productionWorkOrder.start.shiftId && (
                                                                <div>
                                                                    <span className="text-slate-400 dark:text-slate-500 text-[9px] block">Shift ID</span>
                                                                    <span className="font-mono">{workOrderStatus.productionWorkOrder.start.shiftId}</span>
                                                                </div>
                                                            )}
                                                            {workOrderStatus.productionWorkOrder.start.batchReference && (
                                                                <div>
                                                                    <span className="text-slate-400 dark:text-slate-500 text-[9px] block">Batch Reference</span>
                                                                    <span className="font-mono">{workOrderStatus.productionWorkOrder.start.batchReference}</span>
                                                                </div>
                                                            )}
                                                            {workOrderStatus.productionWorkOrder.start.estimatedCompletionAt && (
                                                                <div className="col-span-2">
                                                                    <span className="text-slate-400 dark:text-slate-500 text-[9px] block">Est. Completion At</span>
                                                                    <span className="font-mono">{formatDate(workOrderStatus.productionWorkOrder.start.estimatedCompletionAt)}</span>
                                                                </div>
                                                            )}
                                                            {workOrderStatus.productionWorkOrder.start.operatorNote && (
                                                                <div className="col-span-2">
                                                                    <span className="text-slate-400 dark:text-slate-500 text-[9px] block">Operator Note</span>
                                                                    <div className="bg-slate-50 dark:bg-black/40 p-1.5 border border-slate-100 dark:border-white/5 whitespace-pre-wrap font-sans text-xs">
                                                                        {workOrderStatus.productionWorkOrder.start.operatorNote}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* History Logs */}
                                                {((workOrderStatus.productionWorkOrder.pauseHistory && workOrderStatus.productionWorkOrder.pauseHistory.length > 0) ||
                                                  (workOrderStatus.productionWorkOrder.resumeHistory && workOrderStatus.productionWorkOrder.resumeHistory.length > 0)) && (
                                                    <div className="p-3 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 space-y-2">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Execution History Log</strong>
                                                        <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar text-[10px] font-mono">
                                                            {[
                                                                ...(workOrderStatus.productionWorkOrder.pauseHistory || []).map((p: any) => ({ ...p, type: 'PAUSE' })),
                                                                ...(workOrderStatus.productionWorkOrder.resumeHistory || []).map((r: any) => ({ ...r, type: 'RESUME' }))
                                                            ].sort((a, b) => new Date(a.pausedAt || a.resumedAt).getTime() - new Date(b.pausedAt || b.resumedAt).getTime()).map((item, idx) => (
                                                                <div key={idx} className="border-l-2 border-indigo-400 pl-2 py-0.5">
                                                                    <div className="flex justify-between text-slate-400">
                                                                        <span>{item.type} by {item.pausedBy || item.resumedBy}</span>
                                                                        <span>{formatDate(item.pausedAt || item.resumedAt)}</span>
                                                                    </div>
                                                                    {item.reason && <div className="text-amber-600 dark:text-amber-400">Reason: {item.reason}</div>}
                                                                    {item.note && <div className="text-slate-600 dark:text-slate-300">Note: {item.note}</div>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Cancellation Context */}
                                                {workOrderStatus.productionWorkOrder.cancel && (
                                                    <div className="p-3 bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/10 text-red-900 dark:text-red-400 space-y-2">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px]">Cancellation Details</strong>
                                                        <div className="text-xs space-y-1">
                                                            <div><span className="font-bold">Cancelled At:</span> {formatDate(workOrderStatus.productionWorkOrder.cancel.cancelledAt)}</div>
                                                            <div><span className="font-bold">Operator:</span> {workOrderStatus.productionWorkOrder.cancel.cancelledBy}</div>
                                                            <div><span className="font-bold">Reason:</span> {workOrderStatus.productionWorkOrder.cancel.reason}</div>
                                                            {workOrderStatus.productionWorkOrder.cancel.note && <div><span className="font-bold">Note:</span> {workOrderStatus.productionWorkOrder.cancel.note}</div>}
                                                        </div>
                                                        <div className="pt-2 border-t border-red-200/50 dark:border-red-500/20 font-mono text-[9px] space-y-0.5 text-slate-500">
                                                            <div>commercialImpact: {workOrderStatus.productionWorkOrder.cancel.commercialImpact}</div>
                                                            <div>refundTriggered: {String(workOrderStatus.productionWorkOrder.cancel.refundTriggered)}</div>
                                                            <div>invoiceCancelled: {String(workOrderStatus.productionWorkOrder.cancel.invoiceCancelled)}</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Mutation actions */}
                                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/10">
                                            
                                            {/* Action 1: Create Work Order */}
                                            {!workOrderStatus?.productionWorkOrder && (
                                                <button 
                                                    onClick={handleCreateWorkOrder}
                                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                    disabled={workOrderActionLoading || (workOrderEligibility && !workOrderEligibility.eligible)}
                                                >
                                                    {workOrderActionLoading ? 'Creating Work Order...' : 'Create Production Work Order'}
                                                </button>
                                            )}

                                            {/* Action 2: Start Work Order Form */}
                                            {workOrderStatus?.productionWorkOrder?.status === 'WORK_ORDER_CREATED' && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Start Parameters</strong>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input 
                                                            type="text" 
                                                            placeholder="Shift ID" 
                                                            className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                            value={woShiftId}
                                                            onChange={e => setWoShiftId(e.target.value)}
                                                            disabled={workOrderActionLoading}
                                                        />
                                                        <input 
                                                            type="text" 
                                                            placeholder="Batch Reference" 
                                                            className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                            value={woBatchRef}
                                                            onChange={e => setWoBatchRef(e.target.value)}
                                                            disabled={workOrderActionLoading}
                                                        />
                                                        <input 
                                                            type="text" 
                                                            placeholder="Est. Completion At (ISO)" 
                                                            className="col-span-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white font-mono"
                                                            value={woEstCompletion}
                                                            onChange={e => setWoEstCompletion(e.target.value)}
                                                            disabled={workOrderActionLoading}
                                                        />
                                                        <textarea 
                                                            placeholder="Operator Notes..."
                                                            className="col-span-2 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white h-12"
                                                            value={woOperatorNote}
                                                            onChange={e => setWoOperatorNote(e.target.value)}
                                                            disabled={workOrderActionLoading}
                                                        />
                                                    </div>
                                                    <button 
                                                        onClick={handleStartWorkOrder}
                                                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={workOrderActionLoading}
                                                    >
                                                        {workOrderActionLoading ? 'Starting...' : 'Start Execution'}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Action 3: Pause Work Order Form */}
                                            {workOrderStatus?.productionWorkOrder?.status === 'PRODUCTION_STARTED' && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Pause Details</strong>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Reason for Pause (Required)" 
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                        value={woPauseReason}
                                                        onChange={e => setWoPauseReason(e.target.value)}
                                                        disabled={workOrderActionLoading}
                                                    />
                                                    <textarea 
                                                        placeholder="Additional note..."
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white h-12"
                                                        value={woPauseNote}
                                                        onChange={e => setWoPauseNote(e.target.value)}
                                                        disabled={workOrderActionLoading}
                                                    />
                                                    <button 
                                                        onClick={handlePauseWorkOrder}
                                                        className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={workOrderActionLoading}
                                                    >
                                                        {workOrderActionLoading ? 'Pausing...' : 'Pause Execution'}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Action 4: Resume Work Order Form */}
                                            {workOrderStatus?.productionWorkOrder?.status === 'PRODUCTION_PAUSED' && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Resume Details</strong>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Resume note (Optional)" 
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                        value={woOperatorNote}
                                                        onChange={e => setWoOperatorNote(e.target.value)}
                                                        disabled={workOrderActionLoading}
                                                    />
                                                    <button 
                                                        onClick={handleResumeWorkOrder}
                                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={workOrderActionLoading}
                                                    >
                                                        {workOrderActionLoading ? 'Resuming...' : 'Resume Execution'}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Action 5: Cancel Work Order Form (Available in any active state) */}
                                            {workOrderStatus?.productionWorkOrder && ['WORK_ORDER_CREATED', 'PRODUCTION_STARTED', 'PRODUCTION_PAUSED'].includes(workOrderStatus.productionWorkOrder.status) && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-red-200 dark:border-red-500/20">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-red-600 dark:text-red-400">Cancel Work Order</strong>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Reason for Cancellation (Required)" 
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                        value={woCancelReason}
                                                        onChange={e => setWoCancelReason(e.target.value)}
                                                        disabled={workOrderActionLoading}
                                                    />
                                                    <textarea 
                                                        placeholder="Additional cancellation note..."
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white h-12"
                                                        value={woCancelNote}
                                                        onChange={e => setWoCancelNote(e.target.value)}
                                                        disabled={workOrderActionLoading}
                                                    />
                                                    <button 
                                                        onClick={handleCancelWorkOrder}
                                                        className="w-full py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={workOrderActionLoading}
                                                    >
                                                        {workOrderActionLoading ? 'Cancelling...' : 'Cancel Work Order'}
                                                    </button>
                                                </div>
                                            )}

                                        </div>
                                    </div>
                                )}

                                {/* Phase 38.7 — Production Progress Gate */}
                                {detail && ['PRODUCTION_STARTED', 'PRODUCTION_IN_PROGRESS', 'PRODUCTION_PAUSED', 'PRODUCTION_COMPLETION_READY'].includes(detail.status || detail.handoffStatus || (productionStatus && productionStatus.orderStatus) || (workOrderStatus && workOrderStatus.orderStatus) || (productionProgressStatus && productionProgressStatus.orderStatus)) && (
                                    <div className="mt-8 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-4 animate-slide-fade">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                                            <ArrowPathIcon className="w-4 h-4 text-indigo-500 animate-spin-slow" />
                                            Production Progress Gate
                                        </h4>

                                        {/* Blockers & Warnings */}
                                        {productionProgressEligibility && (
                                            <div className="space-y-3 mb-4">
                                                {productionProgressEligibility.blockers && productionProgressEligibility.blockers.length > 0 && (
                                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Production Progress Blocked</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {productionProgressEligibility.blockers.map((b: string) => <li key={b}>{b}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                                {productionProgressEligibility.warnings && productionProgressEligibility.warnings.length > 0 && (
                                                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Eligibility Warnings</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {productionProgressEligibility.warnings.map((w: string) => <li key={w}>{w}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Current Status Display */}
                                        <div className="space-y-4 mb-4">
                                            <div className="grid grid-cols-2 gap-4 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Progress Status</div>
                                                    <span className={`inline-block px-2 py-0.5 border text-[9px] uppercase tracking-wider font-mono ${
                                                        (productionProgressStatus?.productionProgress?.status || detail?.status) === 'PRODUCTION_STARTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                                                        (productionProgressStatus?.productionProgress?.status || detail?.status) === 'PRODUCTION_IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' :
                                                        (productionProgressStatus?.productionProgress?.status || detail?.status) === 'PRODUCTION_PAUSED' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' :
                                                        (productionProgressStatus?.productionProgress?.status || detail?.status) === 'PRODUCTION_COMPLETION_READY' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' :
                                                        'bg-slate-50 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'
                                                    }`}>
                                                        {productionProgressStatus?.productionProgress?.status || detail?.status}
                                                    </span>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Progress Percentage</div>
                                                    <div className="font-mono text-xs text-slate-900 dark:text-white font-bold">{productionProgressStatus?.productionProgress?.progressPercent ?? 0}%</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Last Milestone</div>
                                                    <div className="font-mono text-xs text-slate-900 dark:text-white font-bold">{productionProgressStatus?.productionProgress?.lastMilestone || 'None'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Work Order ID</div>
                                                    <div className="font-mono text-xs text-slate-900 dark:text-white truncate font-bold">{productionProgressStatus?.productionProgress?.workOrderId || workOrderStatus?.productionWorkOrder?.workOrderId || '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Machine ID</div>
                                                    <div className="font-mono text-xs text-slate-900 dark:text-white font-bold">{productionProgressStatus?.productionProgress?.machineId || workOrderStatus?.productionWorkOrder?.machineId || '—'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Last Updated</div>
                                                    <div className="font-mono text-xs text-slate-900 dark:text-white">
                                                        {productionProgressStatus?.productionProgress?.updatedAt ? (
                                                            `${formatDate(productionProgressStatus.productionProgress.updatedAt)} by ${productionProgressStatus.productionProgress.updatedBy}`
                                                        ) : (
                                                            'Not updated yet'
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Milestones Log */}
                                            {productionProgressStatus?.productionProgress?.milestones && productionProgressStatus.productionProgress.milestones.length > 0 && (
                                                <div className="p-3 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 space-y-2">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Recorded Milestones Log</strong>
                                                    <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar text-[10px] font-mono">
                                                        {productionProgressStatus.productionProgress.milestones.map((m: any, idx: number) => (
                                                            <div key={idx} className="border-l-2 border-emerald-500 pl-2 py-0.5">
                                                                <div className="flex justify-between text-slate-400">
                                                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                                        {m.milestone === 'CUSTOM' ? m.customMilestoneLabel : m.milestone} ({m.progressPercent}%)
                                                                    </span>
                                                                    <span>{formatDate(m.recordedAt)}</span>
                                                                </div>
                                                                <div className="text-slate-500">Recorded By: {m.recordedBy}</div>
                                                                {m.note && <div className="text-slate-600 dark:text-slate-300">Note: {m.note}</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* History Logs */}
                                            {productionProgressStatus?.productionProgress &&
                                             ((productionProgressStatus.productionProgress.pauseHistory && productionProgressStatus.productionProgress.pauseHistory.length > 0) ||
                                              (productionProgressStatus.productionProgress.resumeHistory && productionProgressStatus.productionProgress.resumeHistory.length > 0)) && (
                                                <div className="p-3 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 space-y-2">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Progress Governance Log</strong>
                                                    <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar text-[10px] font-mono">
                                                        {[
                                                            ...(productionProgressStatus.productionProgress.pauseHistory || []).map((p: any) => ({ ...p, type: 'PAUSE' })),
                                                            ...(productionProgressStatus.productionProgress.resumeHistory || []).map((r: any) => ({ ...r, type: 'RESUME' }))
                                                        ].sort((a, b) => new Date(a.pausedAt || a.resumedAt).getTime() - new Date(b.pausedAt || b.resumedAt).getTime()).map((item, idx) => (
                                                            <div key={idx} className="border-l-2 border-amber-500 pl-2 py-0.5">
                                                                <div className="flex justify-between text-slate-400">
                                                                    <span>{item.type} by {item.pausedBy || item.resumedBy}</span>
                                                                    <span>{formatDate(item.pausedAt || item.resumedAt)}</span>
                                                                </div>
                                                                {item.reason && <div className="text-amber-600 dark:text-amber-400 font-bold">Reason: {item.reason}</div>}
                                                                {item.note && <div className="text-slate-600 dark:text-slate-300">Note: {item.note}</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Completion Ready Context */}
                                            {productionProgressStatus?.productionProgress?.completionReady && (
                                                <div className="p-3 bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/10 text-indigo-900 dark:text-indigo-400 space-y-2">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px]">Completion Readiness Details</strong>
                                                    <div className="text-xs space-y-1 font-mono">
                                                        <div><span className="font-bold">Marked At:</span> {formatDate(productionProgressStatus.productionProgress.completionReady.markedAt)}</div>
                                                        <div><span className="font-bold">Marked By:</span> {productionProgressStatus.productionProgress.completionReady.markedBy}</div>
                                                        {productionProgressStatus.productionProgress.completionReady.note && <div><span className="font-bold">Note:</span> {productionProgressStatus.productionProgress.completionReady.note}</div>}
                                                        <div className="pt-2 border-t border-indigo-200/50 dark:border-indigo-500/20 text-[9px] text-slate-500 space-y-0.5">
                                                            <div>completionTriggered: {String(productionProgressStatus.productionProgress.completionReady.completionTriggered)}</div>
                                                            <div>shipmentTriggered: {String(productionProgressStatus.productionProgress.completionReady.shipmentTriggered)}</div>
                                                            <div>qaRequired: {String(productionProgressStatus.productionProgress.completionReady.qaRequired)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/10">
                                            {/* Action 1: Record Progress Form */}
                                            {['PRODUCTION_STARTED', 'PRODUCTION_IN_PROGRESS'].includes(productionProgressStatus?.productionProgress?.status || detail?.status) && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Record Progress Milestone</strong>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="col-span-2">
                                                            <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Milestone</label>
                                                            <select
                                                                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                                value={progressMilestone}
                                                                onChange={e => setProgressMilestone(e.target.value)}
                                                                disabled={progressActionLoading}
                                                            >
                                                                <option value="MATERIALS_STAGED">MATERIALS_STAGED</option>
                                                                <option value="PLATES_PREPARED">PLATES_PREPARED</option>
                                                                <option value="PRESS_SETUP">PRESS_SETUP</option>
                                                                <option value="PRINTING_STARTED">PRINTING_STARTED</option>
                                                                <option value="PRINTING_COMPLETED">PRINTING_COMPLETED</option>
                                                                <option value="BINDING_STARTED">BINDING_STARTED</option>
                                                                <option value="BINDING_COMPLETED">BINDING_COMPLETED</option>
                                                                <option value="PACKAGING_STARTED">PACKAGING_STARTED</option>
                                                                <option value="PACKAGING_COMPLETED">PACKAGING_COMPLETED</option>
                                                                <option value="CUSTOM">CUSTOM</option>
                                                            </select>
                                                        </div>

                                                        {progressMilestone === 'CUSTOM' && (
                                                            <div className="col-span-2">
                                                                <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Custom Label</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Custom milestone label (Required)"
                                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white font-semibold"
                                                                    value={customMilestoneLabel}
                                                                    onChange={e => setCustomMilestoneLabel(e.target.value)}
                                                                    disabled={progressActionLoading}
                                                                />
                                                            </div>
                                                        )}

                                                        <div>
                                                            <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Progress % (0-99)</label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="99"
                                                                placeholder="Percent e.g. 50"
                                                                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white font-mono font-bold"
                                                                value={progressPercent}
                                                                onChange={e => setProgressPercent(e.target.value)}
                                                                disabled={progressActionLoading}
                                                            />
                                                        </div>

                                                        <div className="flex items-center gap-2 pt-5">
                                                            <input
                                                                type="checkbox"
                                                                id="progressForceRegression"
                                                                checked={progressForceRegression}
                                                                onChange={e => setProgressForceRegression(e.target.checked)}
                                                                disabled={progressActionLoading}
                                                                className="rounded border-slate-300 dark:border-white/20 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label htmlFor="progressForceRegression" className="text-[10px] uppercase font-bold text-slate-500 select-none">Force Regression</label>
                                                        </div>

                                                        {progressForceRegression && (
                                                            <div className="col-span-2">
                                                                <label className="block text-[9px] uppercase font-bold text-red-500 mb-1">Regression Reason (Required)</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Why is progress regressed?"
                                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-red-200 dark:border-red-500/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                                    value={progressRegressionReason}
                                                                    onChange={e => setProgressRegressionReason(e.target.value)}
                                                                    disabled={progressActionLoading}
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="col-span-2">
                                                            <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Progress Note</label>
                                                            <textarea
                                                                placeholder="Optional notes about this progress milestone..."
                                                                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white h-12"
                                                                value={progressNote}
                                                                onChange={e => setProgressNote(e.target.value)}
                                                                disabled={progressActionLoading}
                                                            />
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={handleRecordProgress}
                                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={progressActionLoading || (productionProgressEligibility && !productionProgressEligibility.eligible)}
                                                    >
                                                        {progressActionLoading ? 'Recording...' : 'Record Progress'}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Action 2: Pause Production Form */}
                                            {['PRODUCTION_STARTED', 'PRODUCTION_IN_PROGRESS'].includes(productionProgressStatus?.productionProgress?.status || detail?.status) && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Pause Production</strong>
                                                    <input
                                                        type="text"
                                                        placeholder="Reason for Pause (Required)"
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                        value={progressPauseReason}
                                                        onChange={e => setProgressPauseReason(e.target.value)}
                                                        disabled={progressActionLoading}
                                                    />
                                                    <textarea
                                                        placeholder="Additional pause note (Optional)..."
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white h-12"
                                                        value={progressPauseNote}
                                                        onChange={e => setProgressPauseNote(e.target.value)}
                                                        disabled={progressActionLoading}
                                                    />
                                                    <button
                                                        onClick={handlePauseProgress}
                                                        className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={progressActionLoading || (productionProgressEligibility && !productionProgressEligibility.eligible)}
                                                    >
                                                        {progressActionLoading ? 'Pausing...' : 'Pause Production'}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Action 3: Resume Production Form */}
                                            {(productionProgressStatus?.productionProgress?.status === 'PRODUCTION_PAUSED' || detail?.status === 'PRODUCTION_PAUSED') && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Resume Production</strong>
                                                    <input
                                                        type="text"
                                                        placeholder="Resume note (Optional)"
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white"
                                                        value={progressResumeNote}
                                                        onChange={e => setProgressResumeNote(e.target.value)}
                                                        disabled={progressActionLoading}
                                                    />
                                                    <button
                                                        onClick={handleResumeProgress}
                                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={progressActionLoading || (productionProgressEligibility && !productionProgressEligibility.eligible)}
                                                    >
                                                        {progressActionLoading ? 'Resuming...' : 'Resume Production'}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Action 4: Mark Completion Ready Form */}
                                            {(productionProgressStatus?.productionProgress?.status === 'PRODUCTION_IN_PROGRESS' || detail?.status === 'PRODUCTION_IN_PROGRESS') &&
                                             (productionProgressStatus?.productionProgress?.progressPercent >= 90) && (
                                                <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-indigo-200 dark:border-indigo-500/20">
                                                    <strong className="block font-black uppercase tracking-wider text-[9px] text-indigo-600 dark:text-indigo-400">Mark Completion Ready</strong>
                                                    <textarea
                                                        placeholder="Ready note (Optional)..."
                                                        className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white h-12"
                                                        value={progressCompletionReadyNote}
                                                        onChange={e => setProgressCompletionReadyNote(e.target.value)}
                                                        disabled={progressActionLoading}
                                                    />
                                                    <button
                                                        onClick={handleMarkCompletionReady}
                                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                        disabled={progressActionLoading || (productionProgressEligibility && !productionProgressEligibility.eligible)}
                                                    >
                                                        {progressActionLoading ? 'Marking...' : 'Mark Completion Ready'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Phase 38.8 — Production Completion & Delivery Handoff Gate */}
                                {detail && ['PRODUCTION_COMPLETION_READY', 'PRODUCTION_COMPLETED', 'DELIVERY_HANDOFF_READY'].includes(detail.status || detail.handoffStatus || (productionProgressStatus?.productionProgress?.status) || (completionEligibility?.currentStatus)) && (
                                    <div className="mt-8 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-4 animate-slide-fade">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                                            <DocumentCheckIcon className="w-4 h-4 text-emerald-500 animate-pulse" />
                                            Phase 38.8 — Completion & Delivery Handoff
                                        </h4>

                                        {/* Completion Eligibility Panel */}
                                        {completionEligibility && (
                                            <div className="space-y-3 mb-4">
                                                {/* Blockers */}
                                                {completionEligibility.blockers && completionEligibility.blockers.length > 0 && (
                                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Completion Blockers</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {completionEligibility.blockers.map((b: string) => <li key={b}>{b.replace(/_/g, ' ')}</li>)}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Warnings */}
                                                {completionEligibility.warnings && completionEligibility.warnings.length > 0 && (
                                                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Completion Warnings</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {completionEligibility.warnings.map((w: string) => <li key={w}>{w.replace(/_/g, ' ')}</li>)}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Details */}
                                                <div className="grid grid-cols-2 gap-4 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10 text-xs font-mono">
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Completion Eligibility</div>
                                                        <span className={`inline-block px-2 py-0.5 border text-[9px] uppercase tracking-wider font-bold ${
                                                            completionEligibility.eligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                                        }`}>
                                                            {completionEligibility.eligible ? 'ELIGIBLE' : 'BLOCKED'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Current Status</div>
                                                        <span className="font-bold text-slate-900 dark:text-white">{completionEligibility.currentStatus || detail?.status}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Completion Action Panel */}
                                        {completionEligibility && (completionEligibility.currentStatus || detail?.status) !== 'PRODUCTION_COMPLETED' && (completionEligibility.currentStatus || detail?.status) !== 'DELIVERY_HANDOFF_READY' && (
                                            <div className="space-y-3 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10 mb-4">
                                                <strong className="block font-black uppercase tracking-wider text-[9px] text-slate-500">Complete Production Action</strong>
                                                <textarea
                                                    placeholder="Optional operator notes about completion..."
                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/20 text-xs p-1.5 text-slate-900 dark:text-white h-12"
                                                    value={completionNote}
                                                    onChange={e => setCompletionNote(e.target.value)}
                                                    disabled={completionActionLoading}
                                                />
                                                {!completionEligibility.eligible && (
                                                    <div className="space-y-2 p-2.5 bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                id="completionOverride"
                                                                checked={completionOverride}
                                                                onChange={e => setCompletionOverride(e.target.checked)}
                                                                disabled={completionActionLoading}
                                                                className="rounded border-slate-300 dark:border-white/20 text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <label htmlFor="completionOverride" className="text-[10px] uppercase font-black text-red-600 select-none">Force Eligibility Override (Break Glass)</label>
                                                        </div>
                                                        {completionOverride && (
                                                            <div>
                                                                <label className="block text-[9px] uppercase font-black text-red-500 mb-1">Override Justification Reason (Required)</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Justification for bypassing blockers..."
                                                                    className="w-full bg-white dark:bg-[#131314] border border-red-300 dark:border-red-500/30 text-xs p-1.5 text-slate-900 dark:text-white"
                                                                    value={completionOverrideReason}
                                                                    onChange={e => setCompletionOverrideReason(e.target.value)}
                                                                    disabled={completionActionLoading}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={handleCompleteProduction}
                                                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                                                    disabled={completionActionLoading || (!completionEligibility.eligible && !completionOverride)}
                                                >
                                                    {completionActionLoading ? 'Executing...' : 'Complete Production'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Handoff Eligibility Panel */}
                                        {((completionEligibility?.currentStatus || detail?.status) === 'PRODUCTION_COMPLETED' || (completionEligibility?.currentStatus || detail?.status) === 'DELIVERY_HANDOFF_READY') && handoffReadiness && (
                                            <div className="space-y-3 mb-4">
                                                {/* Handoff Blockers */}
                                                {handoffReadiness.blockers && handoffReadiness.blockers.length > 0 && (
                                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Handoff Blockers</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {handoffReadiness.blockers.map((b: string) => <li key={b}>{b.replace(/_/g, ' ')}</li>)}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Handoff Warnings */}
                                                {handoffReadiness.warnings && handoffReadiness.warnings.length > 0 && (
                                                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                                                        <strong className="block font-black uppercase tracking-wider text-[9px] mb-1">Handoff Warnings</strong>
                                                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                                                            {handoffReadiness.warnings.map((w: string) => <li key={w}>{w.replace(/_/g, ' ')}</li>)}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Details */}
                                                <div className="grid grid-cols-2 gap-4 bg-white dark:bg-[#131314] p-3 border border-slate-200 dark:border-white/10 text-xs font-mono">
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Handoff Readiness</div>
                                                        <span className={`inline-block px-2 py-0.5 border text-[9px] uppercase tracking-wider font-bold ${
                                                            handoffReadiness.eligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                                        }`}>
                                                            {handoffReadiness.eligible ? 'READY' : 'NOT READY'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-1">Handoff Status</div>
                                                        <span className="font-bold text-slate-900 dark:text-white">{handoffReadiness.deliveryHandoffStatus || 'PENDING'}</span>
                                                    </div>
                                                </div>

                                                {/* Prepare Handoff Action */}
                                                {handoffReadiness.deliveryHandoffStatus !== 'DELIVERY_HANDOFF_READY' && (
                                                    <button
                                                        onClick={handlePrepareDeliveryHandoff}
                                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 mt-2"
                                                        disabled={handoffActionLoading || !handoffReadiness.eligible}
                                                    >
                                                        {handoffActionLoading ? 'Preparing...' : 'Prepare Delivery Handoff'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Action Footer */}
                    {detail && detail.status !== 'PRINTHOUSE_ACCEPTED' && (
                        <div className="p-4 bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-white/10">
                            {actionState.type ? (
                                <div className="space-y-3 animate-slide-fade">
                                    <div className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 flex items-center justify-between">
                                        <span>Confirm {actionState.type}</span>
                                        <button onClick={() => setActionState({ type: null, reason: '' })} className="text-slate-400 hover:text-slate-600"><XCircleIcon className="w-4 h-4"/></button>
                                    </div>
                                    {actionState.type !== 'ACCEPT' && (
                                        <textarea 
                                            value={actionState.reason} 
                                            onChange={e => setActionState({ ...actionState, reason: e.target.value })}
                                            placeholder={`Enter ${actionState.type.toLowerCase()} reason/message...`}
                                            className="w-full text-xs p-2 bg-white dark:bg-black border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white"
                                            rows={2}
                                        />
                                    )}
                                    <button 
                                        onClick={handleAction}
                                        className={`w-full py-2 text-xs font-black uppercase tracking-widest text-white transition-colors ${
                                            actionState.type === 'ACCEPT' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                            actionState.type === 'REJECT' ? 'bg-red-600 hover:bg-red-700' :
                                            'bg-amber-600 hover:bg-amber-700'
                                        }`}
                                    >
                                        Execute {actionState.type}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setActionState({ type: 'ACCEPT', reason: '' })}
                                        className="flex-1 flex justify-center items-center gap-1 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 dark:hover:bg-emerald-500/20 text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" /> Accept
                                    </button>
                                    <button 
                                        onClick={() => setActionState({ type: 'CLARIFY', reason: '' })}
                                        className="flex-1 flex justify-center items-center gap-1 py-2 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 dark:hover:bg-amber-500/20 text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        <QuestionMarkCircleIcon className="w-4 h-4" /> Clarify
                                    </button>
                                    <button 
                                        onClick={() => setActionState({ type: 'REJECT', reason: '' })}
                                        className="flex-1 flex justify-center items-center gap-1 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 dark:hover:bg-red-500/20 text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        <XCircleIcon className="w-4 h-4" /> Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
