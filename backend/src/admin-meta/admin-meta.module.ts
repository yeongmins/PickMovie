// backend/src/admin-meta/admin-meta.module.ts
import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { AdminMetaController } from './admin-meta.controller';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [MetaModule],
  controllers: [AdminMetaController],
  providers: [AdminTokenGuard],
})
export class AdminMetaModule {}
