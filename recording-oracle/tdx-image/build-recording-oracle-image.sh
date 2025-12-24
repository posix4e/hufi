#!/bin/bash
# Build an immutable TDX guest image with the recording oracle baked in
# This creates a reproducible, attestable image for confidential computing
#
# The resulting image will have deterministic measurements (MRTD/RTMRs)
# that can be verified by the reputation oracle via remote attestation.

set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
RECORDING_ORACLE_DIR=$(realpath "${SCRIPT_DIR}/..")
TDX_TOOLS_DIR="${TDX_TOOLS_DIR:-${HOME}/tdx}"

# Configuration
UBUNTU_VERSION="${UBUNTU_VERSION:-24.04}"
GUEST_HOSTNAME="${GUEST_HOSTNAME:-recording-oracle-tdx}"
OUTPUT_IMAGE="${OUTPUT_IMAGE:-${SCRIPT_DIR}/recording-oracle-tdx.qcow2}"
IMAGE_SIZE="${IMAGE_SIZE:-20}"  # GB

# Colors for output
ok() { echo -e "\e[1;32m✓ $*\e[0;0m"; }
error() { echo -e "\e[1;31m✗ ERROR: $*\e[0;0m"; exit 1; }
info() { echo -e "\e[0;33m→ $*\e[0;0m"; }

usage() {
    cat <<EOM
Build an immutable TDX guest image with the HuFi Recording Oracle

This script creates a reproducible TDX guest image with the recording oracle
baked in. The image measurements (MRTD, RTMRs) are deterministic and can be
verified via remote attestation.

Usage: $(basename "$0") [OPTIONS]

Options:
  -h              Show this help
  -v VERSION      Ubuntu version (default: 24.04)
  -o FILE         Output image file (default: recording-oracle-tdx.qcow2)
  -s SIZE         Image size in GB (default: 20)
  -t TDX_DIR      Path to Canonical TDX tools (default: ~/tdx)
  -e ENV_FILE     Environment file for recording oracle configuration

Example:
  sudo ./build-recording-oracle-image.sh -v 24.04 -s 30

After building, boot the image with:
  cd ~/tdx/guest-tools && ./run_td.sh -i /path/to/recording-oracle-tdx.qcow2
EOM
}

while getopts "hv:o:s:t:e:" opt; do
    case $opt in
        h) usage; exit 0 ;;
        v) UBUNTU_VERSION="$OPTARG" ;;
        o) OUTPUT_IMAGE="$OPTARG" ;;
        s) IMAGE_SIZE="$OPTARG" ;;
        t) TDX_TOOLS_DIR="$OPTARG" ;;
        e) RECORDING_ORACLE_ENV="$OPTARG" ;;
        *) usage; exit 1 ;;
    esac
done

# Check prerequisites
if [ "$EUID" -ne 0 ]; then
    error "Please run as root (sudo)"
fi

if [ ! -d "${TDX_TOOLS_DIR}" ]; then
    error "TDX tools not found at ${TDX_TOOLS_DIR}. Please clone https://github.com/canonical/tdx or specify with -t"
fi

BASE_IMAGE="${TDX_TOOLS_DIR}/guest-tools/image/tdx-guest-ubuntu-${UBUNTU_VERSION}-generic.qcow2"
if [ ! -f "${BASE_IMAGE}" ]; then
    error "Base TDX image not found at ${BASE_IMAGE}. Run create-td-image.sh first."
fi

info "Building immutable TDX Recording Oracle image..."
info "Base image: ${BASE_IMAGE}"
info "Output: ${OUTPUT_IMAGE}"

# Prepare the recording oracle bundle
info "Preparing recording oracle bundle..."
BUNDLE_DIR=$(mktemp -d)
trap "rm -rf ${BUNDLE_DIR}" EXIT

# Copy recording oracle source (excluding unnecessary files)
rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' \
    --exclude='tdx-image' --exclude='*.log' \
    "${RECORDING_ORACLE_DIR}/" "${BUNDLE_DIR}/recording-oracle/"

# Copy environment file if provided
if [ -n "${RECORDING_ORACLE_ENV}" ] && [ -f "${RECORDING_ORACLE_ENV}" ]; then
    cp "${RECORDING_ORACLE_ENV}" "${BUNDLE_DIR}/recording-oracle/.env"
    info "Using provided environment file"
fi

# Create the setup script that runs inside the guest during image build
cat > "${BUNDLE_DIR}/setup-recording-oracle.sh" << 'SETUP_SCRIPT'
#!/bin/bash
set -e

echo "=== Setting up HuFi Recording Oracle in TDX Guest ==="

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Enable corepack for yarn
corepack enable

# Install build dependencies
apt-get install -y build-essential python3

# Setup recording oracle
ORACLE_DIR="/opt/recording-oracle"
mkdir -p "${ORACLE_DIR}"
cp -r /tmp/recording-oracle/* "${ORACLE_DIR}/"
cd "${ORACLE_DIR}"

# Install dependencies and build
yarn install --immutable || yarn install
yarn build

# Create systemd service for the recording oracle
cat > /etc/systemd/system/recording-oracle.service << 'SERVICE'
[Unit]
Description=HuFi Recording Oracle (TDX Confidential)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=recording-oracle
Group=recording-oracle
WorkingDirectory=/opt/recording-oracle
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/recording-oracle
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE

# Create service user
useradd -r -s /bin/false recording-oracle 2>/dev/null || true
chown -R recording-oracle:recording-oracle "${ORACLE_DIR}"

# Enable the service to start on boot
systemctl daemon-reload
systemctl enable recording-oracle

# Install TDX attestation libraries (should already be present from base image)
apt-get install -y libtdx-attest1 libtdx-attest-dev 2>/dev/null || true

# Clean up to reduce image size
apt-get clean
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

echo "=== Recording Oracle setup complete ==="
echo "The oracle will start automatically on boot."
echo "TDX attestation available at /attestation endpoint."
SETUP_SCRIPT

chmod +x "${BUNDLE_DIR}/setup-recording-oracle.sh"

# Copy the base image
info "Copying base TDX image..."
TMP_IMAGE="/tmp/recording-oracle-tdx-build.qcow2"
cp "${BASE_IMAGE}" "${TMP_IMAGE}"

# Customize the image with the recording oracle
info "Customizing image with recording oracle (this may take several minutes)..."
virt-customize -a "${TMP_IMAGE}" \
    --copy-in "${BUNDLE_DIR}/recording-oracle:/tmp/" \
    --copy-in "${BUNDLE_DIR}/setup-recording-oracle.sh:/tmp/" \
    --run-command "/tmp/setup-recording-oracle.sh" \
    --run-command "rm -rf /tmp/recording-oracle /tmp/setup-recording-oracle.sh"

# Move to final location
mv "${TMP_IMAGE}" "${OUTPUT_IMAGE}"
chmod 644 "${OUTPUT_IMAGE}"

# Calculate and display image measurements
info "Calculating image hash..."
IMAGE_HASH=$(sha256sum "${OUTPUT_IMAGE}" | awk '{print $1}')

echo ""
ok "TDX Recording Oracle image created successfully!"
echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│ Image Details                                                    │"
echo "├─────────────────────────────────────────────────────────────────┤"
printf "│ %-63s │\n" "File: ${OUTPUT_IMAGE}"
printf "│ %-63s │\n" "Size: $(du -h "${OUTPUT_IMAGE}" | awk '{print $1}')"
printf "│ %-63s │\n" "SHA256: ${IMAGE_HASH:0:32}..."
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
echo "To boot this image as a TDX guest:"
echo "  cd ${TDX_TOOLS_DIR}/guest-tools"
echo "  sudo ./run_td.sh -i ${OUTPUT_IMAGE}"
echo ""
echo "After boot:"
echo "  - Recording oracle starts automatically on port 5101"
echo "  - TDX attestation available at GET /attestation"
echo "  - Attestation quote available at GET /attestation/quote"
echo ""
echo "The reputation oracle can verify this instance by:"
echo "  1. Fetching the attestation quote from /attestation/quote"
echo "  2. Verifying the quote signature with Intel's attestation service"
echo "  3. Comparing MRTD/RTMRs against expected values"
