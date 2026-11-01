import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import {
  CurrentActor,
  type AuthenticatedActor,
} from '../shared/decorators/current-actor.decorator.js';
import { Roles } from '../shared/decorators/roles.decorator.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto.js';
import { PasswordResetDto } from './dto/password-reset.dto.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { GoogleOAuthService } from './services/google-oauth.service.js';

const cookieValue = (req: Request, name: string) => {
  const value = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly google: GoogleOAuthService,
  ) {}
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
  @Get('google') googleStart(
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const flow = this.google.begin(returnTo);
      res.setHeader('Set-Cookie', [
        this.google.stateCookie(flow.stateCookie),
        this.google.returnToCookie(flow.returnToCookie),
      ]);
      return res.redirect(302, flow.url);
    } catch {
      return res.redirect(
        302,
        this.google.isConfigured()
          ? this.google.failureUrl()
          : this.google.configurationErrorUrl(),
      );
    }
  }

  @Get('google/callback') async googleCallback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      if (!query.code || !query.state || query.error)
        throw new Error('Google authorization was not completed');
      const result = await this.google.complete(
        query.code,
        query.state,
        cookieValue(req, GoogleOAuthService.stateCookieName),
        cookieValue(req, GoogleOAuthService.returnToCookieName),
      );
      const session = await this.auth.loginWithGoogle(result.profile);
      res.setHeader('Set-Cookie', [
        this.auth.cookie(session.refreshToken),
        this.google.clearStateCookie(),
        this.google.clearReturnToCookie(),
      ]);
      return res.redirect(302, this.google.successUrl(result.returnTo));
    } catch {
      res.setHeader('Set-Cookie', [
        this.google.clearStateCookie(),
        this.google.clearReturnToCookie(),
      ]);
      return res.redirect(302, this.google.failureUrl());
    }
  }

  @Post('refresh') @HttpCode(200) async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.auth.refresh(
        cookieValue(req, 'nexora_refresh'),
      );
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
    await this.auth.logout(cookieValue(req, 'nexora_refresh'));
    res.setHeader('Set-Cookie', this.auth.clearCookie());
  }
  @Get('session')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  async session(@CurrentActor() actor: AuthenticatedActor) {
    return this.auth.session(actor);
  }

  @Get('admin-access')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  adminAccess() {
    return { authorized: true };
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

  @Post('password-reset-requests')
  @HttpCode(202)
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.passwordReset.request(body.email);
  }

  @Post('password-resets')
  @HttpCode(204)
  async resetPassword(
    @Body() body: PasswordResetDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.passwordReset.reset(
      body.token,
      body.newPassword,
      body.confirmPassword,
    );
    res.setHeader('Set-Cookie', this.auth.clearCookie());
  }
}
