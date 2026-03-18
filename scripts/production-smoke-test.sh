#!/bin/bash

# Production Smoke Test Script (v1.11.0)
# Validates: Upload -> Queue -> Worker -> Completion -> Traceability

# Configuration
SERVICE_URL="http://localhost:8001/preflight"
API_KEY="${ADMIN_API_KEY:-dev}"
TEST_FILE="test-pdf.pdf"

echo "--------------------------------------------------"
echo "🚀 STARTING PRODUCTION SMOKE TEST"
echo "Target: $SERVICE_URL"
echo "--------------------------------------------------"

# 1. Create a dummy test file
echo "Creating dummy PDF..."
echo "%PDF-1.4" > $TEST_FILE

# 2. Upload and trigger autofix (Testing service-to-worker flow)
echo "Uploading PDF and triggering async autofix..."
RESPONSE=$(curl -s -X POST "$SERVICE_URL/autofix" \
  -H "x-ppos-api-key: $API_KEY" \
  -F "file=@$TEST_FILE" \
  -F "policy={\"type\":\"standard-production-ready\"}" \
  -F "tenant_id=smoke-test-tenant")

JOB_ID=$(echo $RESPONSE | grep -oP '(?<="jobId":")[^"]+')

if [ -z "$JOB_ID" ]; then
    echo "❌ FAILED: Received no JobId from service"
    echo "Response: $RESPONSE"
    exit 1
fi

echo "✅ SUBMITTED: JobId = $JOB_ID"

# 3. Poll for status (via Dashboard API)
echo "Polling for job completion via control plane..."
MAX_ATTEMPTS=10
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    STATUS_RESP=$(curl -s -X GET "http://localhost:8000/api/admin/jobs/$JOB_ID")
    STATUS=$(echo $STATUS_RESP | grep -oP '(?<="state":")[^"]+')
    
    echo "Attempt $ATTEMPT: Status = $STATUS"
    
    if [ "$STATUS" == "completed" ]; then
        echo "✅ SUCCESS: Job processed correctly!"
        exit 0
    elif [ "$STATUS" == "failed" ]; then
        echo "❌ FAILED: Job failed in the worker"
        exit 1
    fi
    
    sleep 3
    ATTEMPT=$((ATTEMPT+1))
done

echo "⚠️ TIMEOUT: Job is taking too long"
exit 1
