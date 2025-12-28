// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';

import { AiModule } from './ai/ai.module';
import { PickyModule } from './picky/picky.module';
import { TmdbModule } from './tmdb/tmdb.module';
import { MoviesModule } from './movies/movies.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TmdbModule,
    AiModule,
    PickyModule,
    MoviesModule,
    PrismaModule,
    MailModule,
    AuthModule,
  ],
})
export class AppModule {}
