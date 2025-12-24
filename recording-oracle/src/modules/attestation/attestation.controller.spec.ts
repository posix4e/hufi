import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { AttestationController } from './attestation.controller';
import { AttestationService } from './attestation.service';

const mockAttestationService = {
  isTdxAvailable: jest.fn(),
  getAttestationEvidence: jest.fn(),
  getMeasurements: jest.fn(),
};

describe('AttestationController', () => {
  let controller: AttestationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttestationController],
      providers: [
        {
          provide: AttestationService,
          useValue: mockAttestationService,
        },
      ],
    }).compile();

    controller = module.get<AttestationController>(AttestationController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEvidence', () => {
    const mockEvidence = {
      type: 'tdx_report' as const,
      data: {
        reportData: 'abc123',
        report: 'def456',
        timestamp: Date.now(),
      },
      measurements: {
        mrtd: 'mrtd_value',
        rtmr0: 'rtmr0_value',
        rtmr1: 'rtmr1_value',
        rtmr2: 'rtmr2_value',
        rtmr3: 'rtmr3_value',
      },
    };

    it('should return attestation evidence without nonce', async () => {
      mockAttestationService.getAttestationEvidence.mockResolvedValue(
        mockEvidence,
      );

      const result = await controller.getEvidence({});

      expect(result).toEqual(mockEvidence);
      expect(mockAttestationService.getAttestationEvidence).toHaveBeenCalledWith(
        undefined,
        false,
      );
    });

    it('should return attestation evidence with nonce', async () => {
      const nonce = 'test-nonce-123';
      mockAttestationService.getAttestationEvidence.mockResolvedValue(
        mockEvidence,
      );

      const result = await controller.getEvidence({ nonce });

      expect(result).toEqual(mockEvidence);
      expect(mockAttestationService.getAttestationEvidence).toHaveBeenCalledWith(
        nonce,
        false,
      );
    });

    it('should request quote when preferQuote is true', async () => {
      mockAttestationService.getAttestationEvidence.mockResolvedValue(
        mockEvidence,
      );

      const result = await controller.getEvidence({ preferQuote: true });

      expect(result).toEqual(mockEvidence);
      expect(mockAttestationService.getAttestationEvidence).toHaveBeenCalledWith(
        undefined,
        true,
      );
    });

    it('should throw BadRequestException when TDX is not available', async () => {
      mockAttestationService.getAttestationEvidence.mockRejectedValue(
        new Error('TDX attestation is not available on this system'),
      );

      await expect(controller.getEvidence({})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('postEvidence', () => {
    const mockEvidence = {
      type: 'tdx_report' as const,
      data: {
        reportData: 'abc123',
        report: 'def456',
        timestamp: Date.now(),
      },
      measurements: {
        mrtd: 'mrtd_value',
      },
    };

    it('should return attestation evidence for POST request', async () => {
      const nonce = 'post-nonce-456';
      mockAttestationService.getAttestationEvidence.mockResolvedValue(
        mockEvidence,
      );

      const result = await controller.postEvidence({ nonce, preferQuote: true });

      expect(result).toEqual(mockEvidence);
      expect(mockAttestationService.getAttestationEvidence).toHaveBeenCalledWith(
        nonce,
        true,
      );
    });
  });

  describe('getMeasurements', () => {
    const mockMeasurements = {
      mrtd: 'mrtd_value',
      rtmr0: 'rtmr0_value',
      rtmr1: 'rtmr1_value',
      rtmr2: 'rtmr2_value',
      rtmr3: 'rtmr3_value',
      mrConfigId: 'config_id',
      mrOwner: 'owner',
      mrOwnerConfig: 'owner_config',
    };

    it('should return TDX measurements', async () => {
      mockAttestationService.getMeasurements.mockResolvedValue(mockMeasurements);

      const result = await controller.getMeasurements();

      expect(result).toEqual(mockMeasurements);
      expect(mockAttestationService.getMeasurements).toHaveBeenCalled();
    });

    it('should throw BadRequestException when TDX is not available', async () => {
      mockAttestationService.getMeasurements.mockRejectedValue(
        new Error('TDX attestation is not available on this system'),
      );

      await expect(controller.getMeasurements()).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
