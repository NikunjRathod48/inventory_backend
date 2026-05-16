import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Category name cannot exceed 100 characters' })
  categoryname?: string;
}
