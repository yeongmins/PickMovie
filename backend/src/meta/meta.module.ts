// backend/src/meta/meta.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MetaController } from './meta.controller';
import { MetaResolver } from './meta.resolver';
import { MetaService } from './meta.service';
import { MetaWarmupJob } from './meta.warmup.job';

@Module({
  imports: [PrismaModule],
  controllers: [MetaController],
  providers: [MetaService, MetaResolver, MetaWarmupJob],
  exports: [MetaService],
})
export class MetaModule {}
