# TDX Remote Attestation Implementation TODO

## Overview
Implement TDX (Intel Trust Domain Extensions) remote attestation for the HUFI recording oracle, enabling the reputation oracle to cryptographically verify the recording oracle's integrity.

## Phase 1: Reproducible Build Infrastructure ✅

### Task 1.1: Create TDX Dockerfile for Recording Oracle
- [x] Create `recording-oracle/Dockerfile`
- [x] Pin all dependency versions for reproducibility
- [x] Pin base image with digest (`node:20-alpine@sha256:658d0f63e501824d6c23e06d4bb95c71e7d704537c9d9272f488ac03a370d448`)
- [x] Test build reproducibility via GitHub Actions
  - Note: Docker builds aren't bit-for-bit reproducible without specialized tooling
  - TDX measurements are captured at runtime from deployed VM, not from Docker image hash
  - Build once in CI, capture MRTD/RTMRs from TDX hardware

### Task 1.2: Docker Image Registry
- [x] Push images to ghcr.io/posix4e/hufi/recording-oracle
- [x] Tag with git SHA for reproducibility

## Phase 2: GitHub Actions for Measurement ✅

### Task 2.1: Create Measurement Workflow
- [x] Create `.github/workflows/tdx-measure-recording-oracle.yml`
- [x] Build Docker image deterministically
- [x] Deploy to real TDX hardware via Ansible
- [x] Extract measurements from TDX attestation proxy
- [x] Store measurements as workflow artifacts

### Task 2.2: Measurement Publication
- [x] Publish measurements to GitHub releases
- [x] Create measurement manifest JSON with git SHA and image tag
- [x] Add GitHub Artifact Attestations for Docker image and measurements.json

## Phase 3: TDX Deployment ✅

### Task 3.1: Ansible Deployment Infrastructure
- [x] Create `recording-oracle/ansible/` structure
- [x] Create playbooks:
  - [x] `playbooks/deploy.yml` - Full deployment
  - [x] `playbooks/destroy.yml` - Cleanup
  - [x] `playbooks/measure.yml` - Get TDX measurements
  - [x] `playbooks/status.yml` - Check status
  - [x] `playbooks/build-tdx-image.yml` - Build TDX guest image
- [x] Create roles:
  - [x] `roles/tdx_vm/` - TDX VM provisioning
  - [x] `roles/tdx_attestation/` - TDX measurement extraction

### Task 3.2: TDX Attestation Module for Recording Oracle
- [x] Create `tdx-attestation.service.ts`
- [x] Create `tdx-attestation.controller.ts`
- [x] Create `tdx-attestation.module.ts`
- [x] Integrate into `app.module.ts`
- [ ] Test endpoints:
  - [ ] GET `/attestation/status`
  - [ ] GET `/attestation/quote`
  - [ ] POST `/attestation/quote` (with custom report_data)

### Task 3.3: TDX VM Configuration
- [x] Cloud-init template with:
  - [x] TDX attestation proxy (Python, runs natively on port 8081)
  - [x] Docker-compose stack (postgres, minio, recording-oracle)
  - [x] Systemd services for auto-start
- [x] QEMU/KVM with TDX launchSecurity
- [x] SLIRP networking with port forwarding

### Task 3.4: TDX Attestation Proxy
- [x] HTTP proxy on port 8081 (runs natively in VM, not containerized)
- [x] Endpoints:
  - [x] GET `/status` - TDX availability and device info
  - [x] GET `/quote` - Generate TDX quote with measurements

## Phase 4: Reputation Oracle Verification ⏳

### Task 4.1: TDX Quote Verification Module
- [x] Create `tdx-verification.service.ts`
- [x] Create `tdx-verification.controller.ts`
- [x] Create DTOs for verification requests
- [x] Integrate into reputation oracle `app.module.ts`
- [ ] Test verification endpoints

### Task 4.2: Verification Features
- [x] Parse TDX quote structure
- [x] Extract measurements (MRTD, RTMRs)
- [x] Compare against expected measurements
- [x] Challenge-response verification
- [ ] Intel certificate chain validation (future)

### Task 4.3: Verification API Endpoints
- [x] POST `/tdx-verification/verify-quote`
- [x] POST `/tdx-verification/verify-oracle`
- [x] GET `/tdx-verification/expected-measurements`
- [x] POST `/tdx-verification/update-measurements`
- [x] POST `/tdx-verification/set-measurements`

## Phase 5: Integration & Testing 🔜

### Task 5.1: End-to-End Testing
- [ ] Test build → measure → deploy → verify flow
- [ ] Test measurement mismatch detection
- [ ] Test challenge-response freshness
- [ ] Test error handling

### Task 5.2: Documentation
- [x] Create `docs/TDX_ATTESTATION_PLAN.md`
- [x] Create `recording-oracle/ansible/README.md`
- [ ] Add verification guide
- [ ] Add troubleshooting guide

## Current Status

### Architecture
```
GitHub Actions                    TDX Host (ns3222044.ip-57-130-10.eu)
┌─────────────────┐              ┌─────────────────────────────────────┐
│ Build & Push    │              │  TDX VM (QEMU/KVM with launchSecurity)
│ Docker Image    │──Ansible────▶│  ┌─────────────────────────────────┐│
│                 │              │  │ TDX Attestation Proxy (native)  ││
│ Deploy via      │              │  │ Port 8082: /status, /quote      ││
│ Ansible         │              │  │ Access to /dev/tdx_guest        ││
│                 │              │  ├─────────────────────────────────┤│
│ Get Measurements│◀─────────────│  │ Docker Compose Stack            ││
│ from port 8082  │              │  │ - postgres:5432                 ││
└─────────────────┘              │  │ - minio:9000                    ││
                                 │  │ - recording-oracle:12000        ││
                                 │  └─────────────────────────────────┘│
                                 │  Port forwards: 2222→22, 12000, 8082→8081│
                                 └─────────────────────────────────────┘
```

### Key Files
```
recording-oracle/ansible/
├── playbooks/
│   ├── deploy.yml          # Full deployment
│   ├── destroy.yml         # Cleanup VM
│   ├── measure.yml         # Get TDX measurements
│   ├── status.yml          # Check status
│   └── build-tdx-image.yml # Build TDX guest image
├── roles/
│   ├── tdx_vm/
│   │   ├── tasks/
│   │   │   ├── main.yml
│   │   │   ├── provision.yml
│   │   │   ├── find_base_image.yml
│   │   │   ├── wait.yml
│   │   │   └── destroy.yml
│   │   └── templates/
│   │       ├── user-data.yml.j2  # Cloud-init (TDX proxy + docker-compose)
│   │       ├── meta-data.yml.j2
│   │       ├── network-config.yml.j2
│   │       └── vm.xml.j2         # Libvirt XML with TDX launchSecurity
│   └── tdx_attestation/
│       └── tasks/
│           ├── main.yml
│           ├── status.yml
│           └── measure.yml
└── group_vars/all.yml

recording-oracle/src/modules/tdx-attestation/
├── index.ts
├── tdx-attestation.controller.ts
├── tdx-attestation.module.ts
└── tdx-attestation.service.ts
```

### Endpoints
```
TDX Attestation Proxy (port 8082 on host, 8081 in VM):
  GET  http://127.0.0.1:8082/status  - TDX availability
  GET  http://127.0.0.1:8082/quote   - Generate TDX quote

Recording Oracle (port 12000, in docker):
  GET  /attestation/status           - TDX availability (via proxy)
  GET  /attestation/quote            - Generate TDX quote with random nonce
  POST /attestation/quote            - Generate TDX quote with custom report_data

Reputation Oracle (after deployment):
  POST /tdx-verification/verify-quote
  POST /tdx-verification/verify-oracle
  GET  /tdx-verification/expected-measurements
  POST /tdx-verification/update-measurements
  POST /tdx-verification/set-measurements
```

## Environment Variables

### Recording Oracle (in docker-compose via .env)
```env
JWT_PRIVATE_KEY=<EC private key>
JWT_PUBLIC_KEY=<EC public key>
AES_ENCRYPTION_KEY=<32-char key>
WEB3_PRIVATE_KEY=<ethereum private key>
RPC_URL_POLYGON_AMOY=<RPC URL>
TDX_ATTESTATION_PROXY_URL=http://host.docker.internal:8081
```

### Reputation Oracle
```env
# Expected TDX measurements (from GitHub Actions)
TDX_EXPECTED_MRTD=<sha384-hash>
TDX_EXPECTED_RTMR0=<sha384-hash>
TDX_EXPECTED_RTMR1=<sha384-hash>
TDX_EXPECTED_RTMR2=<sha384-hash>
TDX_EXPECTED_RTMR3=<sha384-hash>
```

## Files Created/Modified

### New Files
- `docs/TDX_ATTESTATION_PLAN.md`
- `TODO_TDX_ATTESTATION.md` (this file)
- `.github/workflows/tdx-measure-recording-oracle.yml`
- `recording-oracle/Dockerfile.tdx` - Reproducible Dockerfile with pinned base image
- `recording-oracle/.dockerignore` - Docker build exclusions
- `recording-oracle/scripts/tdx-tools/tdx_quote_gen.c`
- `recording-oracle/scripts/tdx-tools/README.md`
- `recording-oracle/ansible/` - Ansible playbooks for TDX VM provisioning
- `recording-oracle/src/modules/tdx-attestation/` - TDX attestation module
- `reputation-oracle/src/modules/tdx-verification/`
- `reputation-oracle/scripts/set-tdx-measurements.sh`

### Modified Files
- `recording-oracle/Dockerfile` - Fixed native module build deps
- `recording-oracle/src/app.module.ts` - Added TdxAttestationModule
- `reputation-oracle/src/app.module.ts` - Added TdxVerificationModule

## Next Steps

1. **Fix GitHub Action**: Ensure workflow completes successfully
2. **Deploy Reputation Oracle**: Test TDX verification endpoints
3. **Integration Test**: Verify recording oracle from reputation oracle
4. **Production Hardening**: Add Intel certificate chain validation
