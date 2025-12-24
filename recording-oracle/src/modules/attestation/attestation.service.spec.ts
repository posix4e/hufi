import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as crypto from 'crypto';

import { AttestationService } from './attestation.service';

jest.mock('fs');

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      NODE_ENV: 'test',
    };
    return config[key] ?? defaultValue;
  }),
};

describe('AttestationService', () => {
  let service: AttestationService;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(async () => {
    mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReset();
    mockFs.readFileSync.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttestationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AttestationService>(AttestationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should detect TDX availability when device exists', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await service.onModuleInit();

      expect(service.isTdxAvailable()).toBe(true);
    });

    it('should detect TDX unavailability when device does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await service.onModuleInit();

      expect(service.isTdxAvailable()).toBe(false);
    });
  });

  describe('getAttestationEvidence', () => {
    it('should throw error when TDX is not available', async () => {
      mockFs.existsSync.mockReturnValue(false);
      await service.onModuleInit();

      await expect(service.getAttestationEvidence()).rejects.toThrow(
        'TDX attestation is not available on this system',
      );
    });
  });

  describe('getMeasurements', () => {
    it('should throw error when TDX is not available', async () => {
      mockFs.existsSync.mockReturnValue(false);
      await service.onModuleInit();

      await expect(service.getMeasurements()).rejects.toThrow(
        'TDX attestation is not available on this system',
      );
    });
  });

  describe('generateReportData', () => {
    it('should generate 64-byte report data without nonce', () => {
      const reportData = service['generateReportData']();

      expect(reportData).toBeInstanceOf(Buffer);
      expect(reportData.length).toBe(64);
    });

    it('should generate SHA-512 hash of nonce when provided', () => {
      const nonce = crypto.randomBytes(32).toString('hex');
      const reportData = service['generateReportData'](nonce);

      const expectedHash = crypto
        .createHash('sha512')
        .update(Buffer.from(nonce, 'hex'))
        .digest();

      expect(reportData).toBeInstanceOf(Buffer);
      expect(reportData.length).toBe(64);
      expect(reportData.equals(expectedHash)).toBe(true);
    });

    it('should generate different report data for different nonces', () => {
      const nonce1 = crypto.randomBytes(32).toString('hex');
      const nonce2 = crypto.randomBytes(32).toString('hex');

      const reportData1 = service['generateReportData'](nonce1);
      const reportData2 = service['generateReportData'](nonce2);

      expect(reportData1.equals(reportData2)).toBe(false);
    });
  });

  describe('parseTdReport', () => {
    it('should parse measurements from a valid TD report', () => {
      // Create a mock TD report buffer (1024 bytes minimum)
      const mockReport = Buffer.alloc(1024);

      // Fill in mock measurements at correct offsets
      const mockMrtd = Buffer.from('a'.repeat(96), 'hex');
      const mockRtmr0 = Buffer.from('b'.repeat(96), 'hex');
      const mockRtmr1 = Buffer.from('c'.repeat(96), 'hex');
      const mockRtmr2 = Buffer.from('d'.repeat(96), 'hex');
      const mockRtmr3 = Buffer.from('e'.repeat(96), 'hex');

      mockMrtd.copy(mockReport, 256);
      mockRtmr0.copy(mockReport, 384);
      mockRtmr1.copy(mockReport, 432);
      mockRtmr2.copy(mockReport, 480);
      mockRtmr3.copy(mockReport, 528);

      const measurements = service['parseTdReport'](mockReport);

      expect(measurements.mrtd).toBe(mockMrtd.toString('hex'));
      expect(measurements.rtmr0).toBe(mockRtmr0.toString('hex'));
      expect(measurements.rtmr1).toBe(mockRtmr1.toString('hex'));
      expect(measurements.rtmr2).toBe(mockRtmr2.toString('hex'));
      expect(measurements.rtmr3).toBe(mockRtmr3.toString('hex'));
    });

    it('should return empty measurements for short report', () => {
      const shortReport = Buffer.alloc(100);

      const measurements = service['parseTdReport'](shortReport);

      expect(measurements.mrtd).toBeUndefined();
      expect(measurements.rtmr0).toBeUndefined();
    });
  });

  describe('attestation types', () => {
    it('should export correct attestation evidence structure', async () => {
      mockFs.existsSync.mockReturnValue(false);
      await service.onModuleInit();

      // Verify the service has the expected methods
      expect(typeof service.getAttestationEvidence).toBe('function');
      expect(typeof service.getMeasurements).toBe('function');
      expect(typeof service.isTdxAvailable).toBe('function');
    });
  });
});
