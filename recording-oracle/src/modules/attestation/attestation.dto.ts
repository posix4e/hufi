import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AttestationStatusDto {
  @ApiProperty({
    description: 'Whether TDX attestation is enabled and available',
    example: true,
  })
  tdxEnabled: boolean;

  @ApiProperty({
    description: 'Timestamp when status was checked',
    example: 1703347200000,
  })
  timestamp: number;
}

export class TdxMeasurementsDto {
  @ApiPropertyOptional({
    description: 'Measurement of initial TD contents (MRTD)',
    example: 'a1b2c3d4...',
  })
  mrtd?: string;

  @ApiPropertyOptional({
    description: 'Runtime measurement register 0',
    example: 'e5f6g7h8...',
  })
  rtmr0?: string;

  @ApiPropertyOptional({
    description: 'Runtime measurement register 1',
    example: 'i9j0k1l2...',
  })
  rtmr1?: string;

  @ApiPropertyOptional({
    description: 'Runtime measurement register 2',
    example: 'm3n4o5p6...',
  })
  rtmr2?: string;

  @ApiPropertyOptional({
    description: 'Runtime measurement register 3',
    example: 'q7r8s9t0...',
  })
  rtmr3?: string;

  @ApiPropertyOptional({
    description: 'MR Config ID',
    example: 'u1v2w3x4...',
  })
  mrConfigId?: string;

  @ApiPropertyOptional({
    description: 'MR Owner',
    example: 'y5z6a7b8...',
  })
  mrOwner?: string;

  @ApiPropertyOptional({
    description: 'MR Owner Config',
    example: 'c9d0e1f2...',
  })
  mrOwnerConfig?: string;
}

export class TdxReportDto {
  @ApiProperty({
    description: 'Report data (hex encoded)',
    example: '0123456789abcdef...',
  })
  reportData: string;

  @ApiProperty({
    description: 'TD Report (hex encoded)',
    example: 'fedcba9876543210...',
  })
  report: string;

  @ApiProperty({
    description: 'Timestamp when report was generated',
    example: 1703347200000,
  })
  timestamp: number;
}

export class TdxQuoteDto {
  @ApiProperty({
    description: 'TDX Quote (base64 encoded)',
    example: 'SGVsbG8gV29ybGQ=',
  })
  quote: string;

  @ApiProperty({
    description: 'Report data (hex encoded)',
    example: '0123456789abcdef...',
  })
  reportData: string;

  @ApiProperty({
    description: 'Timestamp when quote was generated',
    example: 1703347200000,
  })
  timestamp: number;

  @ApiProperty({
    description: 'SHA384 hash of user data included in quote',
    example: 'abc123...',
  })
  userDataHash: string;
}

export class AttestationEvidenceDto {
  @ApiProperty({
    description: 'Type of attestation evidence',
    enum: ['tdx_report', 'tdx_quote'],
    example: 'tdx_report',
  })
  type: 'tdx_report' | 'tdx_quote';

  @ApiProperty({
    description: 'Attestation data (TdxReport or TdxQuote)',
    oneOf: [{ $ref: '#/components/schemas/TdxReportDto' }, { $ref: '#/components/schemas/TdxQuoteDto' }],
  })
  data: TdxReportDto | TdxQuoteDto;

  @ApiProperty({
    description: 'TDX measurements extracted from the evidence',
    type: TdxMeasurementsDto,
  })
  measurements: TdxMeasurementsDto;
}

export class GenerateEvidenceDto {
  @ApiPropertyOptional({
    description: 'User data to include in attestation (hex encoded)',
    example: '0123456789abcdef',
  })
  @IsOptional()
  @IsString()
  userData?: string;

  @ApiPropertyOptional({
    description: 'Prefer TDX Quote over TD Report if available',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  preferQuote?: boolean;
}
