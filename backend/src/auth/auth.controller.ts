import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto.js';
import {
  AuthGuard,
  CurrentActor,
  Roles,
  RolesGuard,
  type AuthenticatedActor,
} from './authorization.js';

const refreshCookie = (req: Request) => {
  const value = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('nexora_refresh='))
    ?.slice('nexora_refresh='.length);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }
  @Post('login') @HttpCode(200) async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body);
    res.setHeader('Set-Cookie', this.auth.cookie(result.refreshToken));
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post('refresh') @HttpCode(200) async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.auth.refresh(refreshCookie(req));
      res.setHeader('Set-Cookie', this.auth.cookie(result.refreshToken));
      return { accessToken: result.accessToken, user: result.user };
    } catch (e) {
      res.setHeader('Set-Cookie', this.auth.clearCookie());
      throw e;
    }
  }
  @Post('logout') @HttpCode(204) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(refreshCookie(req));
    res.setHeader('Set-Cookie', this.auth.clearCookie());
  }
  @Get('session')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  async session(@CurrentActor() actor: AuthenticatedActor) {
    return this.auth.session(actor);
  }
  @Post('change-password')
  @HttpCode(204)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(actor, body);
    res.setHeader('Set-Cookie', this.auth.clearCookie());
  }
}
