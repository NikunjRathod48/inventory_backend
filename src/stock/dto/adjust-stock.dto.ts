import { IsNotEmpty, IsString, IsInt, IsOptional, Min, IsEnum } from 'class-validator';

export enum StockTransactionType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  CANCEL_ORDER = 'CANCEL_ORDER',
}

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty({ message: 'Product ID is required' })
  productid: string;

  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @IsEnum(StockTransactionType, {
    message: 'Transaction type must be PURCHASE, SALE, RETURN, ADJUSTMENT, or CANCEL_ORDER',
  })
  @IsNotEmpty({ message: 'Transaction type is required' })
  transactiontype: StockTransactionType;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  referenceid?: string;
}
