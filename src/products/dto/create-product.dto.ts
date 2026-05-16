import { IsNotEmpty, IsString, IsNumber, IsOptional, IsInt, Min, MaxLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  @MaxLength(150, { message: 'Product name cannot exceed 150 characters' })
  productname: string;

  @IsInt({ message: 'Category ID must be an integer' })
  @IsNotEmpty({ message: 'Category is required' })
  categoryid: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0.01, { message: 'Price must be greater than 0' })
  price: number;

  @IsNumber({}, { message: 'Cost price must be a number' })
  @IsOptional()
  @Min(0, { message: 'Cost price cannot be negative' })
  costprice?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Barcode cannot exceed 100 characters' })
  barcode?: string;
}
