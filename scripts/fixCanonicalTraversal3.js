const fs = require('fs');

let jobsCode = fs.readFileSync('src/api/routes/adminPreflightJobs.js', 'utf8');

const targetSectionOld = \`
        const fixCoverage = rawCanonical?.fix_coverage || rawCanonical?.result?.fix_coverage || null;

        const currentStatus = rawCanonical?.job?.status || rawCanonical?.status || localRecord?.status || 'UNKNOWN';

        let progress = null;
        let issueCount = null;
        let degraded = null;
        let degradedReasons = null;

        if (rawCanonical) {
            progress = isTerminalDiagnosticStatus(currentStatus) ? 100 : (rawCanonical?.job?.progress || rawCanonical.progress || 10);
            issueCount = collectFindings(rawCanonical).length;
            
            const statusUpper = currentStatus.toUpperCase();
            const outcomeCategory = (rawCanonical.outcomeCategory || rawCanonical.outcome_category || '').toUpperCase();
            const isDegradedMode = rawCanonical.analysisIntegrity?.degradedMode === true || rawCanonical.analysisIntegrity?.degraded_mode === true;
            
            degraded = ['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper) ||
                       ['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS'].includes(outcomeCategory) ||
                       isDegradedMode ||
                       rawCanonical.degraded === true || 
                       rawCanonical.isDegraded === true;
                       
            degradedReasons = rawCanonical.degraded_reasons || rawCanonical.degradedReasons || null;
            if (degraded && (!degradedReasons || degradedReasons.length === 0)) {
                degradedReasons = [];
                if (['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper)) degradedReasons.push(\\\`STATUS_DEGRADATION:\${statusUpper}\\\`);
                if (['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS'].includes(outcomeCategory)) degradedReasons.push(\\\`OUTCOME_DEGRADATION:\${outcomeCategory}\\\`);
                if (isDegradedMode) degradedReasons.push('ANALYSIS_INTEGRITY_DEGRADED_MODE');
            }
        } else if (localRecord) {
            progress = localRecord.progress;
            issueCount = localRecord.issue_count;
            degraded = !!localRecord.degraded;
            degradedReasons = safeParseLocal(localRecord.degraded_reasons_json);
        }

        const projection = projectPreflightRegistryRecord(localRecord || {}, rawCanonical);
        const mappedStatus = mapPreflightStatus(localRecord?.type || rawCanonical?.job?.type || rawCanonical?.type, currentStatus, projection);

        const projectedRequestedFixesCount = Math.max(
            Number(projection.requestedFixesCount || 0),
            Array.isArray(requestedFixes) ? requestedFixes.length : 0,
            Array.isArray(rawCanonical?.requestedFixes) ? rawCanonical.requestedFixes.length : 0,
            Array.isArray(rawCanonical?.requested_fixes) ? rawCanonical.requested_fixes.length : 0
        );

        const projectedAppliedFixesCount = Math.max(
            Number(projection.appliedFixesCount || 0),
            Array.isArray(appliedFixes) ? appliedFixes.length : 0,
            Array.isArray(rawCanonical?.appliedFixes) ? rawCanonical.appliedFixes.length : 0,
            Array.isArray(rawCanonical?.applied_fixes) ? rawCanonical.applied_fixes.length : 0
        );

        const projectedSkippedFixesCount = Math.max(
            Number(projection.skippedFixesCount || 0),
            Array.isArray(skippedFixes) ? skippedFixes.length : 0,
            Array.isArray(rawCanonical?.skippedFixes) ? rawCanonical.skippedFixes.length : 0,
            Array.isArray(rawCanonical?.skipped_fixes) ? rawCanonical.skipped_fixes.length : 0
        );

        const projectedFailedFixesCount = Math.max(
            Number(projection.failedFixesCount || 0),
            Array.isArray(failedFixes) ? failedFixes.length : 0,
            Array.isArray(rawCanonical?.failedFixes) ? rawCanonical.failedFixes.length : 0,
            Array.isArray(rawCanonical?.failed_fixes) ? rawCanonical.failed_fixes.length : 0
        );
\`;

const targetSectionNew = \`
        const jobPayload = rawCanonical?.job || rawCanonical;

        const fixCoverage = jobPayload?.fix_coverage || jobPayload?.result?.fix_coverage || null;

        const currentStatus = jobPayload?.status || localRecord?.status || 'UNKNOWN';

        let progress = null;
        let issueCount = null;
        let degraded = null;
        let degradedReasons = null;

        if (jobPayload) {
            progress = isTerminalDiagnosticStatus(currentStatus) ? 100 : (jobPayload.progress || 10);
            issueCount = collectFindings(jobPayload).length;
            
            const statusUpper = currentStatus.toUpperCase();
            const outcomeCategory = (jobPayload.outcomeCategory || jobPayload.outcome_category || '').toUpperCase();
            const isDegradedMode = jobPayload.analysisIntegrity?.degradedMode === true || jobPayload.analysisIntegrity?.degraded_mode === true;
            
            degraded = ['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper) ||
                       ['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS'].includes(outcomeCategory) ||
                       isDegradedMode ||
                       jobPayload.degraded === true || 
                       jobPayload.isDegraded === true;
                       
            degradedReasons = jobPayload.degraded_reasons || jobPayload.degradedReasons || null;
            if (degraded && (!degradedReasons || degradedReasons.length === 0)) {
                degradedReasons = [];
                if (['DEGRADED', 'PARTIAL', 'PARTIAL_ARTIFACTS'].includes(statusUpper)) degradedReasons.push(\\\`STATUS_DEGRADATION:\${statusUpper}\\\`);
                if (['DEGRADED_ANALYSIS', 'PARTIAL_ANALYSIS'].includes(outcomeCategory)) degradedReasons.push(\\\`OUTCOME_DEGRADATION:\${outcomeCategory}\\\`);
                if (isDegradedMode) degradedReasons.push('ANALYSIS_INTEGRITY_DEGRADED_MODE');
            }
        } else if (localRecord) {
            progress = localRecord.progress;
            issueCount = localRecord.issue_count;
            degraded = !!localRecord.degraded;
            degradedReasons = safeParseLocal(localRecord.degraded_reasons_json);
        }

        const projection = projectPreflightRegistryRecord(localRecord || {}, jobPayload);
        const mappedStatus = mapPreflightStatus(localRecord?.type || jobPayload?.type, currentStatus, projection);

        const projectedRequestedFixesCount = Math.max(
            Number(projection.requestedFixesCount || 0),
            Array.isArray(requestedFixes) ? requestedFixes.length : 0,
            Array.isArray(jobPayload?.requestedFixes) ? jobPayload.requestedFixes.length : 0,
            Array.isArray(jobPayload?.requested_fixes) ? jobPayload.requested_fixes.length : 0
        );

        const projectedAppliedFixesCount = Math.max(
            Number(projection.appliedFixesCount || 0),
            Array.isArray(appliedFixes) ? appliedFixes.length : 0,
            Array.isArray(jobPayload?.appliedFixes) ? jobPayload.appliedFixes.length : 0,
            Array.isArray(jobPayload?.applied_fixes) ? jobPayload.applied_fixes.length : 0
        );

        const projectedSkippedFixesCount = Math.max(
            Number(projection.skippedFixesCount || 0),
            Array.isArray(skippedFixes) ? skippedFixes.length : 0,
            Array.isArray(jobPayload?.skippedFixes) ? jobPayload.skippedFixes.length : 0,
            Array.isArray(jobPayload?.skipped_fixes) ? jobPayload.skipped_fixes.length : 0
        );

        const projectedFailedFixesCount = Math.max(
            Number(projection.failedFixesCount || 0),
            Array.isArray(failedFixes) ? failedFixes.length : 0,
            Array.isArray(jobPayload?.failedFixes) ? jobPayload.failedFixes.length : 0,
            Array.isArray(jobPayload?.failed_fixes) ? jobPayload.failed_fixes.length : 0
        );
\`;

if (jobsCode.includes(targetSectionOld)) {
    jobsCode = jobsCode.replace(targetSectionOld, targetSectionNew);
    fs.writeFileSync('src/api/routes/adminPreflightJobs.js', jobsCode);
    console.log('Replaced successfully.');
} else {
    console.log('Target section not found.');
}
