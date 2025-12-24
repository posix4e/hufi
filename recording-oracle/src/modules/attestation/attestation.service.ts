import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

export interface TdxReport {
  reportData: string; // hex encoded
  report: string; // hex encoded TD Report
  timestamp: number;
}

export interface TdxQuote {
  quote: string; // base64 encoded
  reportData: string; // hex encoded
  timestamp: number;
  userDataHash: string; // SHA384 hash of user data included in quote
}

export interface AttestationEvidence {
  type: 'tdx_report' | 'tdx_quote';
  data: TdxReport | TdxQuote;
  measurements: TdxMeasurements;
}

export interface TdxMeasurements {
  mrtd?: string; // Measurement of initial TD contents
  rtmr0?: string; // Runtime measurement register 0
  rtmr1?: string; // Runtime measurement register 1
  rtmr2?: string; // Runtime measurement register 2
  rtmr3?: string; // Runtime measurement register 3
  mrConfigId?: string;
  mrOwner?: string;
  mrOwnerConfig?: string;
}

@Injectable()
export class AttestationService implements OnModuleInit {
  private readonly logger = new Logger(AttestationService.name);
  private isTdxAvailable = false;
  private tdxDevicePath = '/dev/tdx_guest';

  async onModuleInit() {
    this.isTdxAvailable = await this.checkTdxAvailability();
    if (this.isTdxAvailable) {
      this.logger.log('TDX attestation is available');
    } else {
      this.logger.warn(
        'TDX attestation is NOT available - running in non-confidential mode',
      );
    }
  }

  private async checkTdxAvailability(): Promise<boolean> {
    try {
      return fs.existsSync(this.tdxDevicePath);
    } catch {
      return false;
    }
  }

  isTdxEnabled(): boolean {
    return this.isTdxAvailable;
  }

  /**
   * Generate a TDX Report with optional user data
   * The user data (up to 64 bytes) is included in the report and can be used
   * to bind the report to specific application data (e.g., a nonce or hash)
   */
  async generateTdxReport(userData?: Buffer): Promise<TdxReport> {
    if (!this.isTdxAvailable) {
      throw new Error('TDX is not available on this system');
    }

    // Prepare report data (64 bytes)
    const reportData = Buffer.alloc(64);
    if (userData) {
      // If user data is provided, hash it to fit in 64 bytes
      const hash = crypto.createHash('sha512').update(userData).digest();
      hash.copy(reportData, 0, 0, 64);
    } else {
      // Generate random nonce
      crypto.randomFillSync(reportData);
    }

    try {
      // Use the test_tdx_attest binary or direct ioctl
      const tempDir = '/tmp/tdx_attest_' + Date.now();
      fs.mkdirSync(tempDir, { recursive: true });

      const reportDataPath = path.join(tempDir, 'report_data.bin');
      const reportPath = path.join(tempDir, 'report.bin');

      fs.writeFileSync(reportDataPath, reportData);

      // Try using the test binary first
      const testBinaryPath =
        '/usr/share/doc/libtdx-attest-dev/examples/test_tdx_attest';
      if (fs.existsSync(testBinaryPath)) {
        // The test binary generates a report with random data
        // We need to use a custom approach for specific report data
        execSync(`cd ${tempDir} && ${testBinaryPath} 2>/dev/null || true`);
      }

      // Read the generated report if it exists
      let report: Buffer;
      if (fs.existsSync(path.join(tempDir, 'report.dat'))) {
        report = fs.readFileSync(path.join(tempDir, 'report.dat'));
      } else {
        // Fallback: use direct ioctl via a simple C program or Python
        report = await this.getTdReportDirect(reportData);
      }

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });

      return {
        reportData: reportData.toString('hex'),
        report: report.toString('hex'),
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to generate TDX report', error);
      throw new Error(`Failed to generate TDX report: ${error.message}`);
    }
  }

  /**
   * Get TD Report directly using ioctl
   */
  private async getTdReportDirect(reportData: Buffer): Promise<Buffer> {
    // Create a Python script to get the TD report via ioctl
    // TDX_CMD_GET_REPORT0 = _IOWR('T', 1, struct tdx_report_req)
    // where struct tdx_report_req is 1088 bytes (64 + 1024)
    // Calculated: ((3 << 30) | (1088 << 16) | (0x54 << 8) | 1) = 0xc4405401
    const pythonScript = `
import os
import fcntl

TDX_CMD_GET_REPORT0 = 0xc4405401  # _IOWR('T', 1, struct tdx_report_req)

def get_td_report(report_data):
    # Open the TDX guest device
    fd = os.open('/dev/tdx_guest', os.O_RDWR)
    try:
        # Prepare the request structure
        # struct tdx_report_req {
        #     __u8 reportdata[64];
        #     __u8 tdreport[1024];
        # };
        req = bytearray(64 + 1024)
        req[0:64] = report_data
        
        # Make the ioctl call
        fcntl.ioctl(fd, TDX_CMD_GET_REPORT0, req)
        
        # Extract the TD report (1024 bytes after report_data)
        return bytes(req[64:64+1024])
    finally:
        os.close(fd)

# Read report data from stdin
import sys
report_data = sys.stdin.buffer.read(64)
report = get_td_report(report_data)
sys.stdout.buffer.write(report)
`;

    return new Promise((resolve, reject) => {
      const python = spawn('python3', ['-c', pythonScript]);
      const chunks: Buffer[] = [];

      python.stdout.on('data', (data) => chunks.push(data));
      python.stderr.on('data', (data) =>
        this.logger.error(`Python stderr: ${data}`),
      );

      python.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`Python script exited with code ${code}`));
        }
      });

      python.stdin.write(reportData);
      python.stdin.end();
    });
  }

  /**
   * Generate a TDX Quote (requires QGS to be properly configured)
   * This provides a cryptographically signed attestation that can be verified remotely
   */
  async generateTdxQuote(userData?: Buffer): Promise<TdxQuote> {
    if (!this.isTdxAvailable) {
      throw new Error('TDX is not available on this system');
    }

    // Prepare user data hash for report data field
    const userDataHash = userData
      ? crypto.createHash('sha384').update(userData).digest()
      : crypto.randomBytes(48);

    // Pad to 64 bytes
    const reportData = Buffer.alloc(64);
    userDataHash.copy(reportData, 0, 0, 48);

    try {
      // Try using trustauthority-cli first
      const quote = await this.getQuoteViaTrustAuthority(reportData);
      return {
        quote: quote.toString('base64'),
        reportData: reportData.toString('hex'),
        timestamp: Date.now(),
        userDataHash: userDataHash.toString('hex'),
      };
    } catch (error) {
      this.logger.warn(
        'Failed to get quote via trustauthority-cli, trying direct method',
      );
      // Fallback to direct quote generation
      const quote = await this.getQuoteDirect(reportData);
      return {
        quote: quote.toString('base64'),
        reportData: reportData.toString('hex'),
        timestamp: Date.now(),
        userDataHash: userDataHash.toString('hex'),
      };
    }
  }

  private async getQuoteViaTrustAuthority(
    reportData: Buffer,
  ): Promise<Buffer> {
    const userDataHex = reportData.toString('hex');
    try {
      const result = execSync(
        `trustauthority-cli quote -u ${userDataHex} 2>/dev/null`,
        { encoding: 'utf-8' },
      );
      // Parse the quote from the output
      const quoteMatch = result.match(/Quote:\s*([A-Za-z0-9+/=]+)/);
      if (quoteMatch) {
        return Buffer.from(quoteMatch[1], 'base64');
      }
      throw new Error('Could not parse quote from trustauthority-cli output');
    } catch (error) {
      throw new Error(`trustauthority-cli failed: ${error.message}`);
    }
  }

  private async getQuoteDirect(reportData: Buffer): Promise<Buffer> {
    // Use libtdx-attest via a C program or Python bindings
    const pythonScript = `
import ctypes
import sys

# Load the TDX attestation library
try:
    libtdx = ctypes.CDLL('libtdx_attest.so.1')
except OSError:
    libtdx = ctypes.CDLL('libtdx_attest.so')

# Define structures
class TdxReportData(ctypes.Structure):
    _fields_ = [('d', ctypes.c_uint8 * 64)]

class TdxUuid(ctypes.Structure):
    _fields_ = [('d', ctypes.c_uint8 * 16)]

# Function prototypes
libtdx.tdx_att_get_quote.argtypes = [
    ctypes.POINTER(TdxReportData),  # report_data
    ctypes.POINTER(TdxUuid),        # att_key_id (can be NULL)
    ctypes.c_uint32,                # att_key_id_list_size
    ctypes.POINTER(ctypes.c_void_p), # pp_quote
    ctypes.POINTER(ctypes.c_uint32), # p_quote_size
    ctypes.c_uint32                  # flags
]
libtdx.tdx_att_get_quote.restype = ctypes.c_int

libtdx.tdx_att_free_quote.argtypes = [ctypes.c_void_p]
libtdx.tdx_att_free_quote.restype = None

# Read report data
report_data_bytes = sys.stdin.buffer.read(64)
report_data = TdxReportData()
for i, b in enumerate(report_data_bytes):
    report_data.d[i] = b

# Get quote
quote_ptr = ctypes.c_void_p()
quote_size = ctypes.c_uint32()

result = libtdx.tdx_att_get_quote(
    ctypes.byref(report_data),
    None,  # Use default attestation key
    0,
    ctypes.byref(quote_ptr),
    ctypes.byref(quote_size),
    0
)

if result != 0:
    sys.stderr.write(f'tdx_att_get_quote failed with error: {result}\\n')
    sys.exit(1)

# Copy quote data
quote_data = ctypes.string_at(quote_ptr, quote_size.value)
sys.stdout.buffer.write(quote_data)

# Free quote
libtdx.tdx_att_free_quote(quote_ptr)
`;

    return new Promise((resolve, reject) => {
      const python = spawn('python3', ['-c', pythonScript]);
      const chunks: Buffer[] = [];
      let stderr = '';

      python.stdout.on('data', (data) => chunks.push(data));
      python.stderr.on('data', (data) => (stderr += data.toString()));

      python.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`Quote generation failed: ${stderr}`));
        }
      });

      python.stdin.write(reportData);
      python.stdin.end();
    });
  }

  /**
   * Parse TDX measurements from a TD Report
   */
  parseMeasurements(reportHex: string): TdxMeasurements {
    const report = Buffer.from(reportHex, 'hex');

    // TD Report structure offsets (based on Intel TDX spec)
    // The exact offsets depend on the TDX module version
    // These are approximate for TDX 1.5
    const measurements: TdxMeasurements = {};

    if (report.length >= 1024) {
      // MRTD is at offset 256, 48 bytes
      measurements.mrtd = report.subarray(256, 256 + 48).toString('hex');

      // RTMR0-3 are at offset 384, each 48 bytes
      measurements.rtmr0 = report.subarray(384, 384 + 48).toString('hex');
      measurements.rtmr1 = report.subarray(432, 432 + 48).toString('hex');
      measurements.rtmr2 = report.subarray(480, 480 + 48).toString('hex');
      measurements.rtmr3 = report.subarray(528, 528 + 48).toString('hex');

      // MR_CONFIG_ID at offset 576, 48 bytes
      measurements.mrConfigId = report.subarray(576, 576 + 48).toString('hex');

      // MR_OWNER at offset 624, 48 bytes
      measurements.mrOwner = report.subarray(624, 624 + 48).toString('hex');

      // MR_OWNER_CONFIG at offset 672, 48 bytes
      measurements.mrOwnerConfig = report
        .subarray(672, 672 + 48)
        .toString('hex');
    }

    return measurements;
  }

  /**
   * Get full attestation evidence including measurements
   */
  async getAttestationEvidence(
    userData?: Buffer,
    preferQuote = false,
  ): Promise<AttestationEvidence> {
    if (preferQuote) {
      try {
        const quote = await this.generateTdxQuote(userData);
        // For quotes, we need to parse the embedded report
        const quoteBuffer = Buffer.from(quote.quote, 'base64');
        // The TD Report is embedded in the quote at a specific offset
        // This offset varies by quote version
        const reportOffset = 48; // Approximate offset for TDX DCAP quotes
        const reportHex = quoteBuffer
          .subarray(reportOffset, reportOffset + 1024)
          .toString('hex');
        return {
          type: 'tdx_quote',
          data: quote,
          measurements: this.parseMeasurements(reportHex),
        };
      } catch (error) {
        this.logger.warn(
          'Quote generation failed, falling back to TD Report',
          error,
        );
      }
    }

    const report = await this.generateTdxReport(userData);
    return {
      type: 'tdx_report',
      data: report,
      measurements: this.parseMeasurements(report.report),
    };
  }

  /**
   * Get the expected measurements for verification
   * This should be called during build/deployment to record expected values
   */
  async getExpectedMeasurements(): Promise<TdxMeasurements> {
    if (!this.isTdxAvailable) {
      throw new Error('TDX is not available');
    }

    const report = await this.generateTdxReport();
    return this.parseMeasurements(report.report);
  }
}
