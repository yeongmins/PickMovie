// backend/src/picky/picky.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { PickyService } from './picky.service';
import { PickyRecommendDto } from './dto/picky.dto';

@Controller('picky')
export class PickyController {
  constructor(private readonly pickyService: PickyService) {}

  @Post('recommend')
  recommend(@Body() dto: PickyRecommendDto) {
    return this.pickyService.recommend(dto);
  }
}
