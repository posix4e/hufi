# TDX Recording Oracle - Immutable Confidential Image

This directory contains tools to build an **immutable, attestable TDX guest image** with the HuFi Recording Oracle baked in.

## Why Immutable TDX Images?

Running the recording oracle in a TDX (Trust Domain Extensions) confidential VM provides:

1. **Memory Encryption**: All memory is encrypted with keys inaccessible to the host
2. **Attestation**: Cryptographic proof of what code is running
3. **Immutability**: The image cannot be modified after build
4. **Reproducibility**: Same source = same measurements = verifiable builds

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Reputation Oracle (Local)                    │
│  - Verifies TDX attestation quotes                              │
│  - Compares MRTD/RTMRs against expected values                  │
│  - Trusts recording oracle only after verification              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Remote Attestation
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TDX Host (OVH/Cloud)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              TDX Guest (Confidential VM)                  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │           Recording Oracle (Immutable)              │  │  │
│  │  │  - Handles exchange trades                          │  │  │
│  │  │  - Exposes /attestation endpoint                    │  │  │
│  │  │  - Memory encrypted, host cannot see data           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  MRTD: <deterministic measurement of VM>                  │  │
│  │  RTMRs: <runtime measurements>                            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **TDX-enabled host** (Intel 4th Gen Xeon or newer)
2. **Canonical TDX tools** installed:
   ```bash
   git clone https://github.com/canonical/tdx ~/tdx
   cd ~/tdx
   sudo ./setup-tdx-host.sh
   ```
3. **Base TDX guest image** created:
   ```bash
   cd ~/tdx/guest-tools/image
   sudo ./create-td-image.sh -v 24.04
   ```

## Building the Image

```bash
# From the recording-oracle directory
cd tdx-image
sudo ./build-recording-oracle-image.sh

# Or with custom options
sudo ./build-recording-oracle-image.sh \
    -v 24.04 \
    -s 30 \
    -o /path/to/output.qcow2 \
    -e /path/to/.env
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-v` | Ubuntu version | 24.04 |
| `-s` | Image size (GB) | 20 |
| `-o` | Output file | recording-oracle-tdx.qcow2 |
| `-t` | TDX tools directory | ~/tdx |
| `-e` | Environment file | none |

## Running the TDX Guest

```bash
cd ~/tdx/guest-tools
sudo ./run_td.sh -i /path/to/recording-oracle-tdx.qcow2
```

The recording oracle will start automatically on boot, listening on port 5101.

## Attestation Flow

### 1. Recording Oracle Exposes Attestation

The recording oracle exposes these endpoints:

- `GET /attestation` - Returns attestation status and measurements
- `GET /attestation/quote` - Returns the raw TDX quote (base64)
- `GET /attestation/report` - Returns parsed attestation report

### 2. Reputation Oracle Verifies

The reputation oracle:

1. Fetches the attestation quote from the recording oracle
2. Verifies the quote signature using Intel's attestation service
3. Extracts and compares measurements:
   - **MRTD**: Measurement of the TD (should match expected value)
   - **RTMR[0-3]**: Runtime measurements
4. Only proceeds with payouts if attestation is valid

### 3. Expected Measurements

After building the image, record the expected measurements:

```bash
# Boot the image and get measurements
ssh tdx@<guest-ip> "cat /sys/kernel/config/tsm/report/*/provider"
```

Configure these in the reputation oracle's environment:

```env
RECORDING_ORACLE_URL=http://<tdx-guest-ip>:5101
EXPECTED_MRTD=<measurement-from-build>
EXPECTED_RTMR0=<rtmr0-value>
EXPECTED_RTMR1=<rtmr1-value>
EXPECTED_RTMR2=<rtmr2-value>
EXPECTED_RTMR3=<rtmr3-value>
```

## Security Considerations

1. **Image Integrity**: The image hash should be recorded and verified
2. **No SSH in Production**: Consider disabling SSH for production images
3. **Secrets Management**: Use TDX-sealed secrets or secure key injection
4. **Network Isolation**: The TDX guest should only expose necessary ports

## Reproducible Builds

For fully reproducible builds (same source → same measurements):

1. Pin all dependency versions in `yarn.lock`
2. Use the same base Ubuntu cloud image
3. Build in a clean environment
4. Document the exact build commands

## Troubleshooting

### Image won't boot
- Ensure TDX is enabled on the host: `dmesg | grep -i tdx`
- Check BIOS settings for TDX/TME

### Attestation fails
- Verify `/dev/tdx_guest` exists in the guest
- Check that `libtdx-attest` is installed
- Ensure the guest is actually running in TDX mode

### Recording oracle doesn't start
- Check logs: `journalctl -u recording-oracle`
- Verify environment file is correct
- Check database connectivity
