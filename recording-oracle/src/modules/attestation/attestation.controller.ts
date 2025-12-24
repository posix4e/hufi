import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Public } from '@/common/decorators';
import {
  AttestationService,
  AttestationEvidence,
  TdxMeasurements,
} from './attestation.service';
import {
  AttestationEvidenceDto,
  AttestationStatusDto,
  GenerateEvidenceDto,
  TdxMeasurementsDto,
} from './attestation.dto';

@ApiTags('Attestation')
@Controller('attestation')
export class AttestationController {
  constructor(private readonly attestationService: AttestationService) {}

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Get TDX attestation status' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether TDX attestation is available',
    type: AttestationStatusDto,
  })
  getStatus(): AttestationStatusDto {
    return {
      tdxEnabled: this.attestationService.isTdxEnabled(),
      timestamp: Date.now(),
    };
  }

  @Public()
  @Get('evidence')
  @ApiOperation({ summary: 'Get attestation evidence (TD Report or Quote)' })
  @ApiQuery({
    name: 'nonce',
    required: false,
    description: 'Optional nonce (hex encoded) to include in the attestation',
  })
  @ApiQuery({
    name: 'preferQuote',
    required: false,
    description: 'Prefer TDX Quote over TD Report if available',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns attestation evidence',
    type: AttestationEvidenceDto,
  })
  async getEvidence(
    @Query('nonce') nonce?: string,
    @Query('preferQuote') preferQuote?: string,
  ): Promise<AttestationEvidenceDto> {
    if (!this.attestationService.isTdxEnabled()) {
      throw new HttpException(
        'TDX attestation is not available on this system',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const userData = nonce ? Buffer.from(nonce, 'hex') : undefined;
      const evidence = await this.attestationService.getAttestationEvidence(
        userData,
        preferQuote === 'true',
      );
      return this.mapEvidenceToDto(evidence);
    } catch (error) {
      throw new HttpException(
        `Failed to generate attestation evidence: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Post('evidence')
  @ApiOperation({
    summary: 'Generate attestation evidence with custom user data',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns attestation evidence',
    type: AttestationEvidenceDto,
  })
  async generateEvidence(
    @Body() dto: GenerateEvidenceDto,
  ): Promise<AttestationEvidenceDto> {
    if (!this.attestationService.isTdxEnabled()) {
      throw new HttpException(
        'TDX attestation is not available on this system',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const userData = dto.userData
        ? Buffer.from(dto.userData, 'hex')
        : undefined;
      const evidence = await this.attestationService.getAttestationEvidence(
        userData,
        dto.preferQuote,
      );
      return this.mapEvidenceToDto(evidence);
    } catch (error) {
      throw new HttpException(
        `Failed to generate attestation evidence: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Get('measurements')
  @ApiOperation({ summary: 'Get current TDX measurements' })
  @ApiResponse({
    status: 200,
    description: 'Returns current TDX measurements',
    type: TdxMeasurementsDto,
  })
  async getMeasurements(): Promise<TdxMeasurementsDto> {
    if (!this.attestationService.isTdxEnabled()) {
      throw new HttpException(
        'TDX attestation is not available on this system',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const measurements =
        await this.attestationService.getExpectedMeasurements();
      return this.mapMeasurementsToDto(measurements);
    } catch (error) {
      throw new HttpException(
        `Failed to get measurements: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private mapEvidenceToDto(evidence: AttestationEvidence): AttestationEvidenceDto {
    return {
      type: evidence.type,
      data: evidence.data,
      measurements: this.mapMeasurementsToDto(evidence.measurements),
    };
  }

  private mapMeasurementsToDto(
    measurements: TdxMeasurements,
  ): TdxMeasurementsDto {
    return {
      mrtd: measurements.mrtd,
      rtmr0: measurements.rtmr0,
      rtmr1: measurements.rtmr1,
      rtmr2: measurements.rtmr2,
      rtmr3: measurements.rtmr3,
      mrConfigId: measurements.mrConfigId,
      mrOwner: measurements.mrOwner,
      mrOwnerConfig: measurements.mrOwnerConfig,
    };
  }
}
