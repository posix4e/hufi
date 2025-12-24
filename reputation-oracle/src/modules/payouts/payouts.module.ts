import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AttestationModule } from '@/modules/attestation';
import { StorageModule } from '@/modules/storage';
import { Web3Module } from '@/modules/web3';

import { PayoutsService } from './payouts.service';

@Module({
  imports: [AttestationModule, ConfigModule, StorageModule, Web3Module],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutModule {}
