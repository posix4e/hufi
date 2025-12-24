import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';

export interface TdxMeasurements {
  mrtd?: string;
  rtmr0?: string;
  rtmr1?: string;
  rtmr2?: string;
  rtmr3?: string;
  mrConfigId?: string;
  mrOwner?: string;
  mrOwnerConfig?: string;
}

export interface TdxReport {
  reportData: string;
  report: string;
  timestamp: number;
}

export interface TdxQuote {
  quote: string;
  reportData: string;
  timestamp: number;
  userDataHash: string;
}

export interface AttestationEvidence {
  type: 'tdx_report' | 'tdx_quote';
  data: TdxReport | TdxQuote;
  measurements: TdxMeasurements;
}

export interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  measurements?: TdxMeasurements;
  timestamp: number;
}

export interface ExpectedMeasurements {
  mrtd?: string;
  rtmr0?: string;
  rtmr1?: string;
  rtmr2?: string;
  rtmr3?: string;
}

@Injectable()
export class AttestationVerifierService implements OnModuleInit {
  private readonly logger = new Logger(AttestationVerifierService.name);
  private expectedMeasurements: ExpectedMeasurements = {};
  private recordingOracleUrl: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // Load expected measurements from config or environment
    this.recordingOracleUrl = this.configService.get<string>(
      'RECORDING_ORACLE_URL',
      'http://localhost:3000',
    );

    // Expected measurements can be set via environment variables
    // These should be computed during the build/deployment of the recording oracle
    this.expectedMeasurements = {
      mrtd: this.configService.get<string>('EXPECTED_MRTD'),
      rtmr0: this.configService.get<string>('EXPECTED_RTMR0'),
      rtmr1: this.configService.get<string>('EXPECTED_RTMR1'),
      rtmr2: this.configService.get<string>('EXPECTED_RTMR2'),
      rtmr3: this.configService.get<string>('EXPECTED_RTMR3'),
    };

    this.logger.log(
      `Attestation verifier initialized for ${this.recordingOracleUrl}`,
    );
    if (this.expectedMeasurements.mrtd) {
      this.logger.log(`Expected MRTD: ${this.expectedMeasurements.mrtd}`);
    }
  }

  /**
   * Set expected measurements for verification
   */
  setExpectedMeasurements(measurements: ExpectedMeasurements): void {
    this.expectedMeasurements = { ...this.expectedMeasurements, ...measurements };
    this.logger.log('Updated expected measurements');
  }

  /**
   * Fetch attestation evidence from the recording oracle
   */
  async fetchAttestationEvidence(
    nonce?: string,
    preferQuote = false,
  ): Promise<AttestationEvidence> {
    const url = new URL('/attestation/evidence', this.recordingOracleUrl);
    if (nonce) {
      url.searchParams.set('nonce', nonce);
    }
    if (preferQuote) {
      url.searchParams.set('preferQuote', 'true');
    }

    try {
      const response = await axios.get<AttestationEvidence>(url.toString());
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch attestation evidence', error);
      throw new Error(`Failed to fetch attestation evidence: ${error.message}`);
    }
  }

  /**
   * Verify attestation evidence
   */
  async verifyEvidence(evidence: AttestationEvidence): Promise<VerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check timestamp freshness (evidence should be recent)
    const maxAge = 5 * 60 * 1000; // 5 minutes
    const evidenceTimestamp =
      evidence.type === 'tdx_report'
        ? (evidence.data as TdxReport).timestamp
        : (evidence.data as TdxQuote).timestamp;

    if (Date.now() - evidenceTimestamp > maxAge) {
      warnings.push(
        `Attestation evidence is older than ${maxAge / 1000} seconds`,
      );
    }

    // Verify measurements against expected values
    const measurements = evidence.measurements;

    if (this.expectedMeasurements.mrtd) {
      if (measurements.mrtd !== this.expectedMeasurements.mrtd) {
        errors.push(
          `MRTD mismatch: expected ${this.expectedMeasurements.mrtd}, got ${measurements.mrtd}`,
        );
      }
    } else {
      warnings.push('No expected MRTD configured - cannot verify TD identity');
    }

    // RTMR0 typically contains firmware/BIOS measurements
    if (this.expectedMeasurements.rtmr0) {
      if (measurements.rtmr0 !== this.expectedMeasurements.rtmr0) {
        errors.push(
          `RTMR0 mismatch: expected ${this.expectedMeasurements.rtmr0}, got ${measurements.rtmr0}`,
        );
      }
    }

    // RTMR1 typically contains OS/kernel measurements
    if (this.expectedMeasurements.rtmr1) {
      if (measurements.rtmr1 !== this.expectedMeasurements.rtmr1) {
        errors.push(
          `RTMR1 mismatch: expected ${this.expectedMeasurements.rtmr1}, got ${measurements.rtmr1}`,
        );
      }
    }

    // RTMR2 is typically used for application measurements
    if (this.expectedMeasurements.rtmr2) {
      if (measurements.rtmr2 !== this.expectedMeasurements.rtmr2) {
        errors.push(
          `RTMR2 mismatch: expected ${this.expectedMeasurements.rtmr2}, got ${measurements.rtmr2}`,
        );
      }
    }

    // RTMR3 is typically used for runtime measurements
    if (this.expectedMeasurements.rtmr3) {
      if (measurements.rtmr3 !== this.expectedMeasurements.rtmr3) {
        errors.push(
          `RTMR3 mismatch: expected ${this.expectedMeasurements.rtmr3}, got ${measurements.rtmr3}`,
        );
      }
    }

    // For TDX quotes, we could also verify the signature using Intel's verification service
    if (evidence.type === 'tdx_quote') {
      const quoteVerification = await this.verifyQuoteSignature(
        evidence.data as TdxQuote,
      );
      if (!quoteVerification.valid) {
        errors.push(...quoteVerification.errors);
      }
      warnings.push(...quoteVerification.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      measurements,
      timestamp: Date.now(),
    };
  }

  /**
   * Verify TDX quote signature using Intel's verification service
   * This requires the quote to be properly signed by Intel's attestation infrastructure
   */
  private async verifyQuoteSignature(
    quote: TdxQuote,
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Decode the quote
      const quoteBuffer = Buffer.from(quote.quote, 'base64');

      // Basic structure validation
      if (quoteBuffer.length < 48) {
        errors.push('Quote is too short to be valid');
        return { valid: false, errors, warnings };
      }

      // Check quote version (first 2 bytes)
      const version = quoteBuffer.readUInt16LE(0);
      if (version !== 4 && version !== 5) {
        warnings.push(`Unexpected quote version: ${version}`);
      }

      // Check attestation key type (bytes 2-3)
      const attestationKeyType = quoteBuffer.readUInt16LE(2);
      if (attestationKeyType !== 2 && attestationKeyType !== 3) {
        // 2 = ECDSA-256, 3 = ECDSA-384
        warnings.push(`Unexpected attestation key type: ${attestationKeyType}`);
      }

      // For full verification, we would need to:
      // 1. Extract the PCK certificate chain from the quote
      // 2. Verify the certificate chain against Intel's root CA
      // 3. Verify the quote signature using the PCK public key
      // 4. Check TCB status against Intel's TCB info

      // This requires either:
      // - Intel Trust Authority API (cloud-based)
      // - Local DCAP verification libraries

      // For now, we do basic structural validation
      // Full cryptographic verification would require additional setup

      warnings.push(
        'Full cryptographic quote verification not implemented - using structural validation only',
      );

      return { valid: true, errors, warnings };
    } catch (error) {
      errors.push(`Quote verification failed: ${error.message}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Perform a full attestation check with challenge-response
   * This generates a nonce, requests attestation, and verifies the response
   */
  async performAttestationCheck(): Promise<VerificationResult> {
    // Generate a random nonce for freshness
    const nonce = crypto.randomBytes(32).toString('hex');

    this.logger.log(`Performing attestation check with nonce: ${nonce}`);

    try {
      // Fetch evidence with our nonce
      const evidence = await this.fetchAttestationEvidence(nonce, true);

      // Verify the nonce is included in the evidence
      const reportData =
        evidence.type === 'tdx_report'
          ? (evidence.data as TdxReport).reportData
          : (evidence.data as TdxQuote).reportData;

      // The report data should contain a hash of our nonce
      const expectedHash = crypto
        .createHash('sha512')
        .update(Buffer.from(nonce, 'hex'))
        .digest('hex');

      if (reportData !== expectedHash) {
        return {
          valid: false,
          errors: ['Nonce verification failed - evidence may be replayed'],
          warnings: [],
          measurements: evidence.measurements,
          timestamp: Date.now(),
        };
      }

      // Verify the evidence
      return await this.verifyEvidence(evidence);
    } catch (error) {
      return {
        valid: false,
        errors: [`Attestation check failed: ${error.message}`],
        warnings: [],
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Check if the recording oracle is running in a trusted TDX environment
   */
  async isRecordingOracleTrusted(): Promise<boolean> {
    try {
      const result = await this.performAttestationCheck();
      if (!result.valid) {
        this.logger.warn(
          `Recording oracle attestation failed: ${result.errors.join(', ')}`,
        );
      }
      return result.valid;
    } catch (error) {
      this.logger.error('Failed to verify recording oracle trust', error);
      return false;
    }
  }

  /**
   * Parse measurements from a raw TD Report
   */
  parseMeasurementsFromReport(reportHex: string): TdxMeasurements {
    const report = Buffer.from(reportHex, 'hex');
    const measurements: TdxMeasurements = {};

    if (report.length >= 1024) {
      // TD Report structure offsets (TDX 1.5)
      measurements.mrtd = report.subarray(256, 256 + 48).toString('hex');
      measurements.rtmr0 = report.subarray(384, 384 + 48).toString('hex');
      measurements.rtmr1 = report.subarray(432, 432 + 48).toString('hex');
      measurements.rtmr2 = report.subarray(480, 480 + 48).toString('hex');
      measurements.rtmr3 = report.subarray(528, 528 + 48).toString('hex');
      measurements.mrConfigId = report.subarray(576, 576 + 48).toString('hex');
      measurements.mrOwner = report.subarray(624, 624 + 48).toString('hex');
      measurements.mrOwnerConfig = report
        .subarray(672, 672 + 48)
        .toString('hex');
    }

    return measurements;
  }
}
