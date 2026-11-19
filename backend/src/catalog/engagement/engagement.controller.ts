import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  CurrentActor,
  type AuthenticatedActor,
} from '../../shared/decorators/current-actor.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../../shared/guards/auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { EngagementService } from './engagement.service.js';

class ReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @Length(1, 2000) content!: string;
}
class ReviewStatusDto {
  @IsIn(['APPROVED', 'HIDDEN']) status!: 'APPROVED' | 'HIDDEN';
}
class ReviewListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'HIDDEN']) status?: string;
}

@Controller()
export class EngagementController {
  constructor(private readonly service: EngagementService) {}
  @Get('wishlist')
  @UseGuards(AuthGuard)
  wishlist(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.wishlist(actor);
  }
  @Put('wishlist/:id')
  @UseGuards(AuthGuard)
  addWishlist(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    return this.service.addWishlist(actor, id);
  }
  @Delete('wishlist/:id')
  @UseGuards(AuthGuard)
  removeWishlist(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    return this.service.removeWishlist(actor, id);
  }
  @Get('products/:id/reviews')
  reviews(@Param('id') id: string) {
    return this.service.reviews(id);
  }
  @Post('products/:id/reviews')
  @UseGuards(AuthGuard)
  review(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() body: ReviewDto,
  ) {
    return this.service.review(actor, id, body);
  }
  @Get('admin/reviews')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  adminReviews(@Query() query: ReviewListDto) {
    return this.service.adminReviews(query.page, query.status);
  }
  @Patch('admin/reviews/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  moderate(@Param('id') id: string, @Body() body: ReviewStatusDto) {
    return this.service.moderate(id, body.status);
  }
}
