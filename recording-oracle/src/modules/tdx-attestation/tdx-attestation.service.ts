import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as crypto from 'crypto';

interface TdxQuoteResponse {
  quote: string;
  quote_size: number;
  report: string;
  report_data: string;
}

interface TdxStatus {
  available: boolean;
  method: 'device' | 'proxy' | 'none';
  device?: string;
  proxyUrl?: string;
  error?: string;
}

@Injectable()
export class TdxAttestationService {
  private readonly logger = new Logger(TdxAttestationService.name);
  private readonly TDX_DEVICE = '/dev/tdx_guest';
  private readonly proxyUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.proxyUrl = this.configService.get<string>('TDX_ATTESTATION_PROXY_URL');
    this.logger.log(`TDX Attestation Service initialized`);
    this.logger.log(`  Proxy URL: ${this.proxyUrl || 'not configured'}`);
  }

  async getStatus(): Promise<TdxStatus> {
    // Check for TDX device
    if (fs.existsSync(this.TDX_DEVICE)) {
      return {
        available: true,
        method: 'device',
        device: this.TDX_DEVICE,
      };
    }

    // Check for proxy
    if (this.proxyUrl) {
      try {
        const response = await fetch(`${this.proxyUrl}/status`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          return {
            available: true,
            method: 'proxy',
            proxyUrl: this.proxyUrl,
          };
        }
      } catch (error) {
        this.logger.warn(`TDX proxy not available: ${error}`);
      }
    }

    return {
      available: false,
      method: 'none',
      error: 'No TDX device or proxy available',
    };
  }

  async generateQuote(reportData?: string): Promise<TdxQuoteResponse> {
    const status = await this.getStatus();

    if (!status.available) {
      throw new Error(status.error || 'TDX not available');
    }

    // Prepare report data (64 bytes max)
    let reportDataHex = reportData || '';
    if (!reportDataHex) {
      // Generate random nonce if no report data provided
      reportDataHex = crypto.randomBytes(32).toString('hex');
    }

    // Pad or truncate to 64 bytes (128 hex chars)
    reportDataHex = reportDataHex.padEnd(128, '0').substring(0, 128);

    if (status.method === 'proxy') {
      return this.generateQuoteViaProxy(reportDataHex);
    } else {
      return this.generateQuoteViaDevice(reportDataHex);
    }
  }

  private async generateQuoteViaProxy(
    reportDataHex: string,
  ): Promise<TdxQuoteResponse> {
    const response = await fetch(`${this.proxyUrl}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_data: reportDataHex }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Proxy error: ${error}`);
    }

    return (await response.json()) as TdxQuoteResponse;
  }

  private async generateQuoteViaDevice(
    reportDataHex: string,
  ): Promise<TdxQuoteResponse> {
    // Use the tdx_quote_gen binary if available
    const { execSync } = await import('child_process');

    try {
      const output = execSync(`/opt/tdx/tdx_quote_gen ${reportDataHex}`, {
        encoding: 'utf-8',
        timeout: 30000,
      });
      return JSON.parse(output) as TdxQuoteResponse;
    } catch (error) {
      throw new Error(`Failed to generate quote via device: ${error}`);
    }
  }
}
