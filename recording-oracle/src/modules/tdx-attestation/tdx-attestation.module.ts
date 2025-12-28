import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TdxAttestationController } from './tdx-attestation.controller';
import { TdxAttestationService } from './tdx-attestation.service';

@Module({
  imports: [ConfigModule],
  controllers: [TdxAttestationController],
  providers: [TdxAttestationService],
  exports: [TdxAttestationService],
})
export class TdxAttestationModule {}
