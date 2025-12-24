#!/bin/bash
# Deploy Recording Oracle to TDX Guest VM
# This script deploys the recording oracle to a TDX-enabled guest VM

set -e

# Configuration
TDX_HOST="${TDX_HOST:-ubuntu@ns3222044.ip-57-130-10.eu}"
TDX_GUEST_IP="${TDX_GUEST_IP:-192.168.122.203}"
TDX_GUEST_USER="${TDX_GUEST_USER:-tdx}"
TDX_GUEST_PASSWORD="${TDX_GUEST_PASSWORD:-123456}"
DEPLOY_DIR="/home/tdx/recording-oracle"

echo "=== TDX Recording Oracle Deployment ==="
echo "TDX Host: $TDX_HOST"
echo "TDX Guest: $TDX_GUEST_IP"
echo ""

# Function to run command on TDX guest via host
run_on_guest() {
    ssh "$TDX_HOST" "sshpass -p '$TDX_GUEST_PASSWORD' ssh -o StrictHostKeyChecking=accept-new $TDX_GUEST_USER@$TDX_GUEST_IP '$1'"
}

# Function to copy file to TDX guest via host
copy_to_guest() {
    local src="$1"
    local dst="$2"
    # First copy to host, then to guest
    local tmp_path="/tmp/tdx_deploy_$(basename $src)"
    scp "$src" "$TDX_HOST:$tmp_path"
    ssh "$TDX_HOST" "sshpass -p '$TDX_GUEST_PASSWORD' scp -o StrictHostKeyChecking=accept-new $tmp_path $TDX_GUEST_USER@$TDX_GUEST_IP:$dst"
    ssh "$TDX_HOST" "rm -f $tmp_path"
}

echo "Step 1: Checking TDX guest connectivity..."
if run_on_guest "echo 'Connected to TDX guest'"; then
    echo "✓ TDX guest is accessible"
else
    echo "✗ Failed to connect to TDX guest"
    exit 1
fi

echo ""
echo "Step 2: Verifying TDX environment..."
if run_on_guest "test -c /dev/tdx_guest && echo 'TDX device found'"; then
    echo "✓ TDX device is available"
else
    echo "✗ TDX device not found - not running in TDX guest"
    exit 1
fi

echo ""
echo "Step 3: Installing Node.js if needed..."
run_on_guest "which node || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs)"

echo ""
echo "Step 4: Creating deployment directory..."
run_on_guest "mkdir -p $DEPLOY_DIR"

echo ""
echo "Step 5: Building application locally..."
cd "$(dirname "$0")/.."
yarn install
yarn build

echo ""
echo "Step 6: Creating deployment package..."
DEPLOY_PACKAGE="/tmp/recording-oracle-deploy.tar.gz"
tar -czf "$DEPLOY_PACKAGE" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='test' \
    --exclude='*.spec.ts' \
    dist package.json yarn.lock .yarnrc.yml

echo ""
echo "Step 7: Copying deployment package to TDX guest..."
copy_to_guest "$DEPLOY_PACKAGE" "$DEPLOY_DIR/deploy.tar.gz"

echo ""
echo "Step 8: Extracting and installing on TDX guest..."
run_on_guest "cd $DEPLOY_DIR && tar -xzf deploy.tar.gz && rm deploy.tar.gz"
run_on_guest "cd $DEPLOY_DIR && corepack enable && yarn install --production"

echo ""
echo "Step 9: Creating systemd service..."
SERVICE_FILE=$(cat <<'EOF'
[Unit]
Description=HUFI Recording Oracle (TDX)
After=network.target

[Service]
Type=simple
User=tdx
WorkingDirectory=/home/tdx/recording-oracle
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
)

echo "$SERVICE_FILE" > /tmp/recording-oracle.service
copy_to_guest "/tmp/recording-oracle.service" "/tmp/recording-oracle.service"
run_on_guest "sudo mv /tmp/recording-oracle.service /etc/systemd/system/"
run_on_guest "sudo systemctl daemon-reload"

echo ""
echo "Step 10: Getting TDX measurements for verification..."
MEASUREMENTS=$(run_on_guest "cd $DEPLOY_DIR && node -e \"
const { execSync } = require('child_process');
try {
    const result = execSync('/usr/share/doc/libtdx-attest-dev/examples/test_tdx_attest 2>&1', { encoding: 'utf-8' });
    console.log('TD Report generated');
} catch (e) {
    console.log('Note: Full quote generation requires PCCS setup');
}
\"")
echo "$MEASUREMENTS"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "To start the recording oracle:"
echo "  ssh $TDX_HOST \"sshpass -p '$TDX_GUEST_PASSWORD' ssh $TDX_GUEST_USER@$TDX_GUEST_IP 'sudo systemctl start recording-oracle'\""
echo ""
echo "To check status:"
echo "  ssh $TDX_HOST \"sshpass -p '$TDX_GUEST_PASSWORD' ssh $TDX_GUEST_USER@$TDX_GUEST_IP 'sudo systemctl status recording-oracle'\""
echo ""
echo "To view logs:"
echo "  ssh $TDX_HOST \"sshpass -p '$TDX_GUEST_PASSWORD' ssh $TDX_GUEST_USER@$TDX_GUEST_IP 'sudo journalctl -u recording-oracle -f'\""
echo ""
echo "The recording oracle will be accessible at:"
echo "  - From TDX host: http://$TDX_GUEST_IP:3000"
echo "  - Attestation endpoint: http://$TDX_GUEST_IP:3000/attestation/evidence"
