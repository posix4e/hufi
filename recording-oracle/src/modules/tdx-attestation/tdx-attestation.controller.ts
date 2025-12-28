import { Controller, Get, Post, Body, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

import { Public } from '../../common/decorators';

import { TdxAttestationService } from './tdx-attestation.service';

class GenerateQuoteDto {
  reportData?: string;
}

@ApiTags('Attestation')
@Controller('attestation')
export class TdxAttestationController {
  constructor(private readonly tdxService: TdxAttestationService) {}

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Get TDX attestation status' })
  @ApiResponse({
    status: 200,
    description: 'TDX attestation availability status',
  })
  async getStatus() {
    return this.tdxService.getStatus();
  }

  @Public()
  @Get('quote')
  @ApiOperation({ summary: 'Generate TDX quote with random nonce' })
  @ApiResponse({ status: 200, description: 'TDX quote generated successfully' })
  @ApiResponse({ status: 503, description: 'TDX not available' })
  async getQuote() {
    try {
      return await this.tdxService.generateQuote();
    } catch (error) {
      throw new HttpException(
        {
          error: 'TDX quote generation failed',
          message: error instanceof Error ? error.message : String(error),
        },
        503,
      );
    }
  }

  @Public()
  @Post('quote')
  @ApiOperation({ summary: 'Generate TDX quote with custom report data' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reportData: {
          type: 'string',
          description: 'Hex-encoded report data (max 64 bytes / 128 hex chars)',
          example: 'deadbeef',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'TDX quote generated successfully' })
  @ApiResponse({ status: 503, description: 'TDX not available' })
  async generateQuote(@Body() body: GenerateQuoteDto) {
    try {
      return await this.tdxService.generateQuote(body.reportData);
    } catch (error) {
      throw new HttpException(
        {
          error: 'TDX quote generation failed',
          message: error instanceof Error ? error.message : String(error),
        },
        503,
      );
    }
  }
}
