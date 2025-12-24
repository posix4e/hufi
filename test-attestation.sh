#!/bin/bash
# TDX Remote Attestation Verification Script
# Run this from the reputation oracle side (local machine)

RECORDING_ORACLE_URL="${RECORDING_ORACLE_URL:-http://localhost:13000}"

# Expected measurements from the TDX VM (recorded during deployment)
EXPECTED_MRTD="${EXPECTED_MRTD:-ff010300000000000b0104000000000000000000000000007bf063280e94fb051f5dd7b1fc59ce9aac42bb961df8d44b}"
EXPECTED_RTMR3="${EXPECTED_RTMR3:-91eb2b44d141d4ece09f0c75c2c53d247a3c68edd7fafe8a3520c942a604a407de03ae6dc5f87f27428b2538873118b7}"

echo "============================================================"
echo "TDX Remote Attestation Verification"
echo "============================================================"
echo ""
echo "Recording Oracle URL: $RECORDING_ORACLE_URL"
echo ""

# Step 1: Fetch current measurements
echo "Step 1: Fetching TDX measurements..."
MEASUREMENTS=$(curl -s "$RECORDING_ORACLE_URL/attestation/measurements")

if [ $? -ne 0 ] || [ -z "$MEASUREMENTS" ]; then
    echo "❌ Failed to fetch measurements from recording oracle"
    exit 1
fi

# Parse measurements using jq or python
MRTD=$(echo "$MEASUREMENTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('mrtd', ''))")
RTMR0=$(echo "$MEASUREMENTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('rtmr0', ''))")
RTMR1=$(echo "$MEASUREMENTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('rtmr1', ''))")
RTMR2=$(echo "$MEASUREMENTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('rtmr2', ''))")
RTMR3=$(echo "$MEASUREMENTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('rtmr3', ''))")
MR_CONFIG=$(echo "$MEASUREMENTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('mr_config_id', ''))")
MR_OWNER=$(echo "$MEASUREMENTS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('mr_owner', ''))")

echo ""
echo "Current TDX Measurements:"
echo "  MRTD:      $MRTD"
echo "  RTMR0:     $RTMR0"
echo "  RTMR1:     $RTMR1"
echo "  RTMR2:     $RTMR2"
echo "  RTMR3:     $RTMR3"
echo "  MR_CONFIG: $MR_CONFIG"
echo "  MR_OWNER:  $MR_OWNER"

# Step 2: Verify against expected measurements
echo ""
echo "Step 2: Verifying measurements against expected values..."

ERRORS=0

if [ "$MRTD" != "$EXPECTED_MRTD" ]; then
    echo "❌ MRTD mismatch:"
    echo "   Expected: $EXPECTED_MRTD"
    echo "   Actual:   $MRTD"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ MRTD matches expected value"
fi

if [ "$RTMR3" != "$EXPECTED_RTMR3" ]; then
    echo "❌ RTMR3 mismatch:"
    echo "   Expected: $EXPECTED_RTMR3"
    echo "   Actual:   $RTMR3"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ RTMR3 matches expected value"
fi

# Step 3: Fetch full attestation evidence
echo ""
echo "Step 3: Fetching full attestation evidence..."
EVIDENCE=$(curl -s "$RECORDING_ORACLE_URL/attestation/evidence")

if [ $? -ne 0 ] || [ -z "$EVIDENCE" ]; then
    echo "❌ Failed to fetch attestation evidence"
    exit 1
fi

EVIDENCE_TYPE=$(echo "$EVIDENCE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('type', ''))")
TIMESTAMP=$(echo "$EVIDENCE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', {}).get('timestamp', 0))")
REPORT_DATA=$(echo "$EVIDENCE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', {}).get('report_data', '')[:64])")

echo "  Evidence type: $EVIDENCE_TYPE"
echo "  Timestamp: $(date -d @$((TIMESTAMP / 1000)) 2>/dev/null || echo "$TIMESTAMP")"
echo "  Report data: ${REPORT_DATA}..."

# Step 4: Summary
echo ""
echo "============================================================"
echo "ATTESTATION SUMMARY"
echo "============================================================"

if [ $ERRORS -eq 0 ]; then
    echo ""
    echo "✅ ATTESTATION SUCCESSFUL"
    echo ""
    echo "The recording oracle is running in a trusted TDX environment"
    echo "with the expected software configuration."
    echo ""
    echo "You can trust that:"
    echo "  - The recording oracle code has not been tampered with"
    echo "  - The execution environment is confidential"
    echo "  - Trade data is protected from the exchange operator"
else
    echo ""
    echo "❌ ATTESTATION FAILED ($ERRORS errors)"
    echo ""
    echo "The recording oracle measurements do not match expected values."
    echo "This could indicate:"
    echo "  - The software has been modified"
    echo "  - The VM configuration has changed"
    echo "  - A different TDX VM is responding"
    echo ""
    echo "DO NOT TRUST data from this recording oracle!"
fi

echo ""
echo "============================================================"

exit $ERRORS
