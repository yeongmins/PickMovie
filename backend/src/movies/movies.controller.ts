// backend/src/movies/movies.controller.ts

import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { MoviesService } from './movies.service';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Get('popular')
  getPopular() {
    return this.moviesService.getPopular();
  }

  @Get('discover')
  discover(
    @Query('genre') genre?: string,
    @Query('sort_by') sortBy?: string,
    @Query('page') page?: string,
    @Query('languageCode') languageCode?: string,
  ) {
    return this.moviesService.discoverMovies({
      genre,
      sort_by: sortBy,
      page: page ? Number(page) : 1,
      languageCode,
    });
  }

  @Get(':id')
  getDetails(@Param('id', ParseIntPipe) id: number) {
    return this.moviesService.getDetails(id);
  }
}
