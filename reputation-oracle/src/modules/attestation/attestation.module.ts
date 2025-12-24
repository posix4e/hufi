import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttestationVerifierService } from './attestation-verifier.service';

@Module({
  imports: [ConfigModule],
  providers: [AttestationVerifierService],
  exports: [AttestationVerifierService],
})
export class AttestationModule {}
