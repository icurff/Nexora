import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class TrackEventDto {
  @IsUUID()
  eventId!: string;

  @IsIn(['view', 'search'])
  eventType!: 'view' | 'search';

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  queryLength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  resultCount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  categoryId?: string;
}
