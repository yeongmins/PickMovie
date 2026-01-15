// backend/src/meta/meta.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KobisModule } from '../kobis/kobis.module';
import { MetaController } from './meta.controller';
import { MetaResolver } from './meta.resolver';
import { MetaService } from './meta.service';

@Module({
  imports: [PrismaModule, KobisModule],
  controllers: [MetaController],
  providers: [MetaService, MetaResolver],
  exports: [MetaService],
})
export class MetaModule {}
