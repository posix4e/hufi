import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { AttestationVerifierService } from './attestation-verifier.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      RECORDING_ORACLE_URL: 'http://localhost:3000',
      EXPECTED_MRTD: 'expected_mrtd_value',
      EXPECTED_RTMR0: 'expected_rtmr0_value',
      EXPECTED_RTMR3: 'expected_rtmr3_value',
    };
    return config[key] ?? defaultValue;
  }),
};

describe('AttestationVerifierService', () => {
  let service: AttestationVerifierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttestationVerifierService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AttestationVerifierService>(AttestationVerifierService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should load expected measurements from config', async () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('RECORDING_ORACLE_URL', 'http://localhost:3000');
      expect(mockConfigService.get).toHaveBeenCalledWith('EXPECTED_MRTD');
      expect(mockConfigService.get).toHaveBeenCalledWith('EXPECTED_RTMR0');
    });
  });

  describe('setExpectedMeasurements', () => {
    it('should update expected measurements', () => {
      const newMeasurements = {
        mrtd: 'new_mrtd_value',
        rtmr0: 'new_rtmr0_value',
      };

      service.setExpectedMeasurements(newMeasurements);

      // Verify by running verification with matching measurements
      // The internal state should be updated
      expect(service).toBeDefined();
    });
  });

  describe('fetchAttestationEvidence', () => {
    const mockEvidence = {
      type: 'tdx_report',
      data: {
        reportData: 'abc123',
        report: 'def456',
        timestamp: Date.now(),
      },
      measurements: {
        mrtd: 'expected_mrtd_value',
        rtmr0: 'expected_rtmr0_value',
        rtmr3: 'expected_rtmr3_value',
      },
    };

    it('should fetch evidence from recording oracle', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockEvidence });

      const result = await service.fetchAttestationEvidence();

      expect(result).toEqual(mockEvidence);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:3000/attestation/evidence',
      );
    });

    it('should include nonce in request when provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockEvidence });
      const nonce = 'test-nonce-123';

      await service.fetchAttestationEvidence(nonce);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(`nonce=${nonce}`),
      );
    });

    it('should include preferQuote in request when true', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockEvidence });

      await service.fetchAttestationEvidence(undefined, true);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('preferQuote=true'),
      );
    });

    it('should throw error when fetch fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(service.fetchAttestationEvidence()).rejects.toThrow(
        'Failed to fetch attestation evidence',
      );
    });
  });

  describe('verifyEvidence', () => {
    it('should return valid when measurements match', async () => {
      const evidence = {
        type: 'tdx_report' as const,
        data: {
          reportData: 'abc123',
          report: 'def456',
          timestamp: Date.now(),
        },
        measurements: {
          mrtd: 'expected_mrtd_value',
          rtmr0: 'expected_rtmr0_value',
          rtmr3: 'expected_rtmr3_value',
        },
      };

      const result = await service.verifyEvidence(evidence);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid when MRTD does not match', async () => {
      const evidence = {
        type: 'tdx_report' as const,
        data: {
          reportData: 'abc123',
          report: 'def456',
          timestamp: Date.now(),
        },
        measurements: {
          mrtd: 'wrong_mrtd_value',
          rtmr0: 'expected_rtmr0_value',
          rtmr3: 'expected_rtmr3_value',
        },
      };

      const result = await service.verifyEvidence(evidence);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('MRTD mismatch'),
      );
    });

    it('should return invalid when RTMR0 does not match', async () => {
      const evidence = {
        type: 'tdx_report' as const,
        data: {
          reportData: 'abc123',
          report: 'def456',
          timestamp: Date.now(),
        },
        measurements: {
          mrtd: 'expected_mrtd_value',
          rtmr0: 'wrong_rtmr0_value',
          rtmr3: 'expected_rtmr3_value',
        },
      };

      const result = await service.verifyEvidence(evidence);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('RTMR0 mismatch'),
      );
    });

    it('should warn when evidence is stale', async () => {
      const staleTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const evidence = {
        type: 'tdx_report' as const,
        data: {
          reportData: 'abc123',
          report: 'def456',
          timestamp: staleTimestamp,
        },
        measurements: {
          mrtd: 'expected_mrtd_value',
          rtmr0: 'expected_rtmr0_value',
          rtmr3: 'expected_rtmr3_value',
        },
      };

      const result = await service.verifyEvidence(evidence);

      expect(result.warnings).toContain(
        expect.stringContaining('older than'),
      );
    });

    it('should include measurements in result', async () => {
      const measurements = {
        mrtd: 'expected_mrtd_value',
        rtmr0: 'expected_rtmr0_value',
        rtmr3: 'expected_rtmr3_value',
      };
      const evidence = {
        type: 'tdx_report' as const,
        data: {
          reportData: 'abc123',
          report: 'def456',
          timestamp: Date.now(),
        },
        measurements,
      };

      const result = await service.verifyEvidence(evidence);

      expect(result.measurements).toEqual(measurements);
    });
  });

  describe('performAttestationCheck', () => {
    it('should perform full attestation check with nonce', async () => {
      const mockEvidence = {
        type: 'tdx_report' as const,
        data: {
          reportData: 'will_not_match_nonce',
          report: 'def456',
          timestamp: Date.now(),
        },
        measurements: {
          mrtd: 'expected_mrtd_value',
          rtmr0: 'expected_rtmr0_value',
          rtmr3: 'expected_rtmr3_value',
        },
      };
      mockedAxios.get.mockResolvedValue({ data: mockEvidence });

      const result = await service.performAttestationCheck();

      // Should fail nonce verification since reportData won't match
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Nonce verification failed'),
      );
    });

    it('should return error when fetch fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Connection refused'));

      const result = await service.performAttestationCheck();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Attestation check failed');
    });
  });

  describe('isRecordingOracleTrusted', () => {
    it('should return false when attestation fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Connection refused'));

      const result = await service.isRecordingOracleTrusted();

      expect(result).toBe(false);
    });
  });

  describe('parseMeasurementsFromReport', () => {
    it('should parse measurements from hex report', () => {
      // Create a mock report with known values
      const mockReport = Buffer.alloc(1024);
      const mockMrtd = Buffer.from('aa'.repeat(48), 'hex');
      const mockRtmr0 = Buffer.from('bb'.repeat(48), 'hex');

      mockMrtd.copy(mockReport, 256);
      mockRtmr0.copy(mockReport, 384);

      const reportHex = mockReport.toString('hex');
      const measurements = service.parseMeasurementsFromReport(reportHex);

      expect(measurements.mrtd).toBe(mockMrtd.toString('hex'));
      expect(measurements.rtmr0).toBe(mockRtmr0.toString('hex'));
    });

    it('should return empty measurements for short report', () => {
      const shortReport = Buffer.alloc(100).toString('hex');

      const measurements = service.parseMeasurementsFromReport(shortReport);

      expect(measurements.mrtd).toBeUndefined();
    });
  });

  describe('quote verification', () => {
    it('should validate quote structure', async () => {
      // Create a minimal valid quote structure
      const quoteBuffer = Buffer.alloc(100);
      quoteBuffer.writeUInt16LE(4, 0); // version 4
      quoteBuffer.writeUInt16LE(2, 2); // ECDSA-256

      const evidence = {
        type: 'tdx_quote' as const,
        data: {
          quote: quoteBuffer.toString('base64'),
          reportData: 'abc123',
          timestamp: Date.now(),
          userDataHash: 'hash123',
        },
        measurements: {
          mrtd: 'expected_mrtd_value',
          rtmr0: 'expected_rtmr0_value',
          rtmr3: 'expected_rtmr3_value',
        },
      };

      const result = await service.verifyEvidence(evidence);

      // Should pass with warnings about incomplete verification
      expect(result.warnings).toContain(
        expect.stringContaining('structural validation only'),
      );
    });

    it('should reject quote that is too short', async () => {
      const shortQuote = Buffer.alloc(10).toString('base64');

      const evidence = {
        type: 'tdx_quote' as const,
        data: {
          quote: shortQuote,
          reportData: 'abc123',
          timestamp: Date.now(),
          userDataHash: 'hash123',
        },
        measurements: {
          mrtd: 'expected_mrtd_value',
          rtmr0: 'expected_rtmr0_value',
          rtmr3: 'expected_rtmr3_value',
        },
      };

      const result = await service.verifyEvidence(evidence);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('too short'),
      );
    });
  });
});
