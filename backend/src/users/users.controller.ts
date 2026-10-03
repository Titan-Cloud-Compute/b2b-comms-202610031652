import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@UseGuards(JwtAuthGuard)
@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async getMe(@Req() req: Request): Promise<{ id: string; email: string; name: string | null; role: string }> {
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('not authenticated');
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('not authenticated');
    const { id, email, name, role } = user;
    return { id, email, name, role };
  }
}

export class UserNotificationPreferencesController {}
