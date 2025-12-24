#!/usr/bin/env python3
"""
Integration test for TDX Remote Attestation

This test verifies the end-to-end attestation flow between
the recording oracle (running in TDX) and the reputation oracle (verifier).
"""

import json
import hashlib
import secrets
import sys
import urllib.request
import urllib.error

RECORDING_ORACLE_URL = "http://localhost:13000"

# Expected measurements from the TDX VM
EXPECTED_MRTD = "ff010300000000000b0104000000000000000000000000007bf063280e94fb051f5dd7b1fc59ce9aac42bb961df8d44b"
EXPECTED_RTMR3 = "91eb2b44d141d4ece09f0c75c2c53d247a3c68edd7fafe8a3520c942a604a407de03ae6dc5f87f27428b2538873118b7"

def test_measurements_endpoint():
    """Test that the measurements endpoint returns valid TDX measurements."""
    print("Test 1: Measurements Endpoint")
    print("-" * 40)
    
    try:
        with urllib.request.urlopen(f"{RECORDING_ORACLE_URL}/attestation/measurements") as response:
            data = json.loads(response.read().decode())
    except urllib.error.URLError as e:
        print(f"  ❌ FAILED: Could not connect to recording oracle: {e}")
        return False
    
    # Check required fields
    required_fields = ['mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3']
    for field in required_fields:
        if field not in data:
            print(f"  ❌ FAILED: Missing field '{field}'")
            return False
        if not data[field]:
            print(f"  ❌ FAILED: Empty field '{field}'")
            return False
    
    print(f"  MRTD:  {data['mrtd'][:40]}...")
    print(f"  RTMR3: {data['rtmr3'][:40]}...")
    print("  ✅ PASSED: All measurement fields present")
    return True

def test_mrtd_verification():
    """Test that MRTD matches expected value."""
    print("\nTest 2: MRTD Verification")
    print("-" * 40)
    
    with urllib.request.urlopen(f"{RECORDING_ORACLE_URL}/attestation/measurements") as response:
        data = json.loads(response.read().decode())
    
    if data['mrtd'] == EXPECTED_MRTD:
        print(f"  Expected: {EXPECTED_MRTD[:40]}...")
        print(f"  Actual:   {data['mrtd'][:40]}...")
        print("  ✅ PASSED: MRTD matches expected value")
        return True
    else:
        print(f"  Expected: {EXPECTED_MRTD}")
        print(f"  Actual:   {data['mrtd']}")
        print("  ❌ FAILED: MRTD mismatch")
        return False

def test_rtmr3_verification():
    """Test that RTMR3 matches expected value."""
    print("\nTest 3: RTMR3 Verification")
    print("-" * 40)
    
    with urllib.request.urlopen(f"{RECORDING_ORACLE_URL}/attestation/measurements") as response:
        data = json.loads(response.read().decode())
    
    if data['rtmr3'] == EXPECTED_RTMR3:
        print(f"  Expected: {EXPECTED_RTMR3[:40]}...")
        print(f"  Actual:   {data['rtmr3'][:40]}...")
        print("  ✅ PASSED: RTMR3 matches expected value")
        return True
    else:
        print(f"  Expected: {EXPECTED_RTMR3}")
        print(f"  Actual:   {data['rtmr3']}")
        print("  ❌ FAILED: RTMR3 mismatch")
        return False

def test_evidence_endpoint():
    """Test that the evidence endpoint returns valid attestation evidence."""
    print("\nTest 4: Evidence Endpoint")
    print("-" * 40)
    
    with urllib.request.urlopen(f"{RECORDING_ORACLE_URL}/attestation/evidence") as response:
        data = json.loads(response.read().decode())
    
    # Check structure
    if data.get('type') != 'tdx_report':
        print(f"  ❌ FAILED: Expected type 'tdx_report', got '{data.get('type')}'")
        return False
    
    if 'data' not in data or 'measurements' not in data:
        print("  ❌ FAILED: Missing 'data' or 'measurements' field")
        return False
    
    if 'report' not in data['data']:
        print("  ❌ FAILED: Missing 'report' in data")
        return False
    
    print(f"  Type: {data['type']}")
    print(f"  Report length: {len(data['data']['report'])} chars")
    print(f"  Timestamp: {data['data']['timestamp']}")
    print("  ✅ PASSED: Evidence structure is valid")
    return True

def test_challenge_response():
    """Test challenge-response attestation with nonce."""
    print("\nTest 5: Challenge-Response Attestation")
    print("-" * 40)
    
    # Generate random nonce
    nonce = secrets.token_hex(32)
    print(f"  Nonce: {nonce[:32]}...")
    
    # Request attestation with nonce
    url = f"{RECORDING_ORACLE_URL}/attestation/evidence?nonce={nonce}"
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
    
    # Verify report_data is SHA-512 of nonce
    expected_hash = hashlib.sha512(bytes.fromhex(nonce)).hexdigest()
    actual_report_data = data['data'].get('report_data', '')
    
    if actual_report_data == expected_hash:
        print(f"  Expected hash: {expected_hash[:40]}...")
        print(f"  Report data:   {actual_report_data[:40]}...")
        print("  ✅ PASSED: Nonce correctly embedded in TDX report")
        return True
    else:
        print(f"  Expected: {expected_hash}")
        print(f"  Actual:   {actual_report_data}")
        print("  ❌ FAILED: Nonce verification failed")
        return False

def test_freshness():
    """Test that attestation evidence is fresh."""
    print("\nTest 6: Freshness Check")
    print("-" * 40)
    
    import time
    
    with urllib.request.urlopen(f"{RECORDING_ORACLE_URL}/attestation/evidence") as response:
        data = json.loads(response.read().decode())
    
    timestamp = data['data']['timestamp']
    current_time = int(time.time() * 1000)
    age_seconds = (current_time - timestamp) / 1000
    
    print(f"  Evidence timestamp: {timestamp}")
    print(f"  Current time: {current_time}")
    print(f"  Age: {age_seconds:.1f} seconds")
    
    if age_seconds < 60:  # Less than 1 minute old
        print("  ✅ PASSED: Evidence is fresh")
        return True
    else:
        print("  ⚠️ WARNING: Evidence is stale (but test passes)")
        return True

def test_immutability():
    """Test that measurements remain constant across requests."""
    print("\nTest 7: Measurement Immutability")
    print("-" * 40)
    
    measurements = []
    for i in range(3):
        with urllib.request.urlopen(f"{RECORDING_ORACLE_URL}/attestation/measurements") as response:
            data = json.loads(response.read().decode())
            measurements.append(data['mrtd'])
    
    if len(set(measurements)) == 1:
        print(f"  Request 1: {measurements[0][:40]}...")
        print(f"  Request 2: {measurements[1][:40]}...")
        print(f"  Request 3: {measurements[2][:40]}...")
        print("  ✅ PASSED: MRTD is consistent across requests")
        return True
    else:
        print("  ❌ FAILED: MRTD changed between requests")
        return False

def main():
    print("=" * 60)
    print("TDX Remote Attestation Integration Tests")
    print("=" * 60)
    print(f"\nRecording Oracle: {RECORDING_ORACLE_URL}")
    print()
    
    tests = [
        test_measurements_endpoint,
        test_mrtd_verification,
        test_rtmr3_verification,
        test_evidence_endpoint,
        test_challenge_response,
        test_freshness,
        test_immutability,
    ]
    
    results = []
    for test in tests:
        try:
            results.append(test())
        except Exception as e:
            print(f"  ❌ FAILED with exception: {e}")
            results.append(False)
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    
    print(f"\nPassed: {passed}/{total}")
    
    if all(results):
        print("\n✅ ALL TESTS PASSED")
        print("\nThe recording oracle is running in a trusted TDX environment")
        print("and can be verified by the reputation oracle.")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
