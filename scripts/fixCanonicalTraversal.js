const fs = require('fs');

let jobsCode = fs.readFileSync('src/api/routes/adminPreflightJobs.js', 'utf8');

// Fix 1: Extract status properly from rawCanonical
const oldStatusLine = "const currentStatus = rawCanonical?.status || localRecord?.status || 'UNKNOWN';";
const newStatusLine = "const currentStatus = rawCanonical?.job?.status || rawCanonical?.status || localRecord?.status || 'UNKNOWN';";

if (jobsCode.includes(oldStatusLine)) {
    jobsCode = jobsCode.replace(oldStatusLine, newStatusLine);
    console.log('Fixed currentStatus extraction');
}

// Fix 2: Extract type properly
const oldMapLine = "const mappedStatus = mapPreflightStatus(localRecord?.type || rawCanonical?.type, currentStatus, projection);";
const newMapLine = "const mappedStatus = mapPreflightStatus(localRecord?.type || rawCanonical?.job?.type || rawCanonical?.type, currentStatus, projection);";

if (jobsCode.includes(oldMapLine)) {
    jobsCode = jobsCode.replace(oldMapLine, newMapLine);
    console.log('Fixed mappedStatus type extraction');
}

// Fix 3: Extract progress properly
const oldProgressLine = "progress = isTerminalDiagnosticStatus(currentStatus) ? 100 : (rawCanonical.progress || 10);";
const newProgressLine = "progress = isTerminalDiagnosticStatus(currentStatus) ? 100 : (rawCanonical?.job?.progress || rawCanonical.progress || 10);";

if (jobsCode.includes(oldProgressLine)) {
    jobsCode = jobsCode.replace(oldProgressLine, newProgressLine);
    console.log('Fixed progress extraction');
}

fs.writeFileSync('src/api/routes/adminPreflightJobs.js', jobsCode);
