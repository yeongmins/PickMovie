// backend/src/ai/ai.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { AnalyzeDto, AiIntent } from './dto/analyze.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze')
  analyze(@Body() dto: AnalyzeDto): Promise<AiIntent> {
    return this.aiService.analyze(dto);
  }
}
