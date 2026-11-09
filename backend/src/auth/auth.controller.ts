import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { RequestWithUser } from './interfaces/auth.interface';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { IssueRecoveryDto, RedeemRecoveryDto } from './dto/recovery.dto';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('recovery/issue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  issueRecovery(
    @Body() dto: IssueRecoveryDto,
    @Request() req: RequestWithUser,
  ) {
    return this.authService.issueRecovery(dto, req.user!.id);
  }

  @Post('recovery/redeem')
  redeemRecovery(
    @Body() dto: RedeemRecoveryDto,
    @Request() req: RequestWithUser,
  ) {
    return this.authService.redeemRecovery(dto, req.ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto, @Request() req: RequestWithUser) {
    return this.authService.login(loginDto, req.ip);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Request() req: RequestWithUser) {
    return this.authService.logout(req.user!.id, req.user?.jti);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: RequestWithUser) {
    return this.authService.getProfile(req.user!.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  changePassword(
    @Request() req: RequestWithUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user!.id, dto);
  }
}
