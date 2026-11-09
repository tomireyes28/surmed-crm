import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class IssueRecoveryDto {
  @IsUUID('4') userId!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;
}
export class RedeemRecoveryDto {
  @IsString() @Length(64, 64) token!: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}
