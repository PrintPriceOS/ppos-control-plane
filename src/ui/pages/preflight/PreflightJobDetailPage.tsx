import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeftIcon,
  CubeIcon,
  ClockIcon,
  ShieldCheckIcon,
  DocumentArrowDownIcon,
  TicketIcon,
  CommandLineIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CircleStackIcon,
  XCircleIcon,
  DocumentIcon,
  ArrowPathIcon
} from "@heroicons/react/24/outline";
import { getPreflightJob, getPreflightArtifacts, PreflightJob } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { AuditTimeline, TimelineStage } from "../../components/AuditTimeline";

export const PreflightJobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  
  const jobQ = useAdminQuery(`preflight:job:${jobId}`, () => getPreflightJob(jobId!), 5000);
  const artifactsQ = useAdminQuery(`preflight:artifacts:${jobId}`, () => getPreflightArtifacts(jobId!), 10000);

  if (jobQ.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-none animate-spin" />
      </div>
    );
  }

  const job = jobQ.data;
  if (!job) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold text-slate-400 italic">Job not found or unreachable.</h2>
        <Link to="/preflight/jobs" className="mt-4 inline-flex items-center gap-2 text-primary font-bold">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Jobs
        </Link>
      </div>
    );
  }

  const handleDownload = (id: string) => {
    const token = localStorage.getItem('admin_token');
    window.open(`/api/admin/preflight/artifacts/${id}/download?token=${token}`, '_blank');
  };

  // Construct stages for timeline
  const stages: TimelineStage[] = [
    { id: 'CREATED', label: 'Job Created', timestamp: job.created_at, status: 'SUCCESS', details: `Job initialized for tenant ${job.tenant_id}` },
    { id: 'QUEUED', label: 'Queued Upstream', timestamp: job.created_at, status: (['QUEUED', 'PROCESSING', 'COMPLETED'].includes(job.status) ? 'SUCCESS' : job.status === 'FAILED' ? 'FAILED' : 'PENDING'), details: job.upstream_job_id ? `Received ID: ${job.upstream_job_id}` : 'Waiting for engine acknowledgment.' },
    { id: 'PROCESSING', label: 'Engine Processing', timestamp: job.created_at, status: (['PROCESSING', 'COMPLETED'].includes(job.status) ? 'SUCCESS' : job.status === 'FAILED' && !job.upstream_job_id ? 'FAILED' : 'PENDING'), details: 'Engine worker performing requested operation.' },
    { id: 'COMPLETED', label: 'Finalization', timestamp: job.completed_at || job.created_at, status: (job.status === 'COMPLETED' ? 'SUCCESS' : job.status === 'FAILED' ? 'FAILED' : 'PENDING'), details: job.status === 'FAILED' ? (job.error_json?.message || 'Processing failed.') : 'Artifacts generated and verified.' }
  ];

  return (
    <div className="space-y-8 italic-text-off">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/preflight/jobs" className="p-2 hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 rounded-none transition-colors">
            <ArrowLeftIcon className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Job Evidence</h1>
              <span className="px-2 py-0.5 rounded-none bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
                {job.type}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium font-mono">#{job.id}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <div className={`px-4 py-2 rounded-none flex items-center gap-2 border font-black text-xs uppercase tracking-widest ${
             job.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
             job.status === 'FAILED' ? 'bg-red-50 border-red-100 text-red-600' : 'bg-blue-50 border-blue-100 text-blue-600'
           }`}>
             {job.status === 'COMPLETED' ? <CheckCircleIcon className="w-4 h-4" /> : 
              job.status === 'FAILED' ? <XCircleIcon className="w-4 h-4" /> : <ArrowPathIcon className="w-4 h-4 animate-spin" />}
             {job.status}
           </div>
        </div>
      </div>

      {job.status === 'FAILED' && job.error_json && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-none flex items-start gap-3 text-red-600 dark:text-red-400">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest">Processing Error</h4>
            <p className="text-xs font-bold">{job.error_json.message || 'Unknown error occurred during upstream trigger or processing.'}</p>
            {job.error_json.details && (
              <pre className="mt-2 text-[10px] bg-red-100/50 dark:bg-red-900/40 p-2 rounded-none overflow-x-auto">
                {JSON.stringify(job.error_json.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Metadata & Lifecycle */}
        <div className="lg:col-span-2 space-y-8">
          {/* Metadata Grid */}
          <div className="glass p-6 rounded-none border border-white dark:border-white/[0.08] grid grid-cols-2 md:grid-cols-4 gap-6">
            <MetaItem label="Filename" value={job.metadata_json?.originalFilename || 'Untitled'} icon={DocumentIcon} />
            <MetaItem label="Tenant ID" value={job.tenant_id} icon={CircleStackIcon} />
            <MetaItem label="Policy" value={job.policy || 'N/A'} icon={ShieldCheckIcon} />
            <MetaItem label="Upstream ID" value={job.metadata_json?.upstreamJobId || 'NONE'} icon={CommandLineIcon} />
            <MetaItem label="Issues Found" value={String(job.issueCount ?? 0)} icon={ExclamationTriangleIcon} />
            <MetaItem label="Fixes Applied" value={String(job.fixCount ?? 0)} icon={ShieldCheckIcon} />
            <MetaItem label="Progress" value={`${job.progress}%`} icon={ClockIcon} />
            <MetaItem label="Created At" value={new Date(job.created_at).toLocaleString()} icon={ClockIcon} />
          </div>

          {/* Timeline */}
          <div>
            <SectionHeader label="Lifecycle & Trace" />
            <div className="mt-6">
            <div className="mt-4 space-y-4">
               <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#131314]/[0.03] rounded-none border border-slate-100 dark:border-white/[0.05]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-none bg-white dark:bg-[#131314]/[0.05] flex items-center justify-center">
                      <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-[#ECECF1]">Structural Issues</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Detected by Intelligence Layer</p>
                    </div>
                  </div>
                  <span className="text-xl font-black text-slate-900 dark:text-[#ECECF1]">{job.issueCount ?? 0}</span>
               </div>
               
               <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#131314]/[0.03] rounded-none border border-slate-100 dark:border-white/[0.05]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-none bg-white dark:bg-[#131314]/[0.05] flex items-center justify-center">
                      <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-[#ECECF1]">Automated Repairs</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Applied by PDF Fix Engine</p>
                    </div>
                  </div>
                  <span className="text-xl font-black text-emerald-600">{job.fixCount ?? 0}</span>
               </div>
            </div>
          </div>
        </div>
        </div>

        {/* Right Column: Artifacts & Workers */}
        <div className="space-y-8">
          {/* Artifacts */}
          <div className="glass p-6 rounded-none border border-white dark:border-white/[0.08]">
            <SectionHeader label="Artifacts" />
            <div className="mt-4 space-y-2">
              {artifactsQ.data?.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 italic">No artifacts available.</p>
              ) : (
                artifactsQ.data?.map((a, i) => (
                  <button key={i} className="w-full flex items-center justify-between p-3 rounded-none bg-white dark:bg-[#131314]/[0.05] border border-slate-100 dark:border-white/[0.08] hover:border-primary/20 transition-all group">
                    <div className="flex items-center gap-3">
                      <DocumentArrowDownIcon className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-slate-600 dark:text-zinc-300 truncate max-w-[150px]">{a.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">{a.type}</span>
                  </button>
                ))
              )}
              {/* Manual fallback links if artifacts API is empty but we know they exist */}
              {job.status === 'COMPLETED' && artifactsQ.data?.length === 0 && (
                <>
                  <ArtifactButton label="certified.pdf" type="PDF" icon={DocumentArrowDownIcon} />
                  <ArtifactButton label="report.json" type="JSON" icon={CommandLineIcon} />
                  <ArtifactButton label="certificate.pdf" type="PDF" icon={TicketIcon} />
                </>
              )}
            </div>
          </div>

          {/* Worker Info */}
          <div className="glass p-6 rounded-none border border-white dark:border-white/[0.08]">
            <SectionHeader label="Execution Worker" />
            <div className="mt-4 p-4 rounded-none bg-slate-900 text-white">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-none bg-primary/20 flex items-center justify-center">
                    <CpuChipIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest">Worker-EU-1C</h4>
                    <p className="text-[9px] text-zinc-500 font-mono">10.0.42.12</p>
                  </div>
               </div>
               <div className="space-y-2">
                  <WorkerStat label="Memory Usage" value="1.2 GB / 4 GB" progress={30} />
                  <WorkerStat label="CPU Load" value="45%" progress={45} />
               </div>
            </div>
          </div>

          {/* Certificates */}
          <div className="glass p-6 rounded-none border border-white dark:border-white/[0.08]">
            <SectionHeader label="Certificates" />
            <div className="mt-4">
               {job.noopFix ? (
                 <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-none">
                    <ShieldCheckIcon className="w-8 h-8 text-emerald-500" />
                    <div>
                      <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Pure Certification</h4>
                      <p className="text-[10px] text-emerald-600/70 font-medium">No modifications needed.</p>
                    </div>
                 </div>
               ) : (
                 <p className="text-xs font-bold text-slate-400 italic text-center py-4">Standard Repair Cycle Applied</p>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetaItem = ({ label, value, icon: Icon, color = 'text-slate-900 dark:text-[#ECECF1]' }: any) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-1.5 text-slate-400 uppercase font-black text-[9px] tracking-widest">
      <Icon className="w-3 h-3" />
      {label}
    </div>
    <span className={`text-xs font-bold truncate ${color}`} title={value}>{value}</span>
  </div>
);

const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center gap-4">
     <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] whitespace-nowrap">{label}</span>
     <div className="h-[1px] w-full bg-slate-100 dark:bg-[#131314]/[0.05]" />
  </div>
);

const ArtifactButton = ({ label, type, icon: Icon }: any) => (
  <button className="w-full flex items-center justify-between p-3 rounded-none bg-white dark:bg-[#131314]/[0.05] border border-slate-100 dark:border-white/[0.08] hover:border-primary/20 transition-all group">
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
      <span className="text-xs font-bold text-slate-600 dark:text-zinc-300">{label}</span>
    </div>
    <span className="text-[10px] font-mono text-slate-400 uppercase">{type}</span>
  </button>
);

const WorkerStat = ({ label, value, progress }: any) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-zinc-400">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <div className="h-1 bg-white/10 rounded-none overflow-hidden">
      <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progress}%` }} />
    </div>
  </div>
);

const formatSize = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat(Number((bytes || 0) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
