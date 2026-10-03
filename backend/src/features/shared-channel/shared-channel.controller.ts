import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireManager, RequireUser, RolesGuard } from '../../auth/roles.guard';
import type { SessionPayload } from '../../auth/session.types';
import {
  ChannelMessage,
  ChannelSummary,
  CustomerOption,
  SharedChannelService,
} from './shared-channel.service';

function sessionOf(req: Request): SessionPayload {
  const s = req.session;
  if (!s?.userId) throw new UnauthorizedException('not authenticated');
  return s;
}

@ApiTags('channels')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireUser()
@Controller('api/channels')
export class SharedChannelController {
  constructor(private readonly channels: SharedChannelService) {}

  @Get()
  list(@Req() req: Request): Promise<ChannelSummary[]> {
    return this.channels.listChannelsFor(sessionOf(req).userId);
  }

  @Get('customers')
  @RequireManager()
  customers(): Promise<CustomerOption[]> {
    return this.channels.listCustomers();
  }

  @Post()
  @RequireManager()
  create(
    @Req() req: Request,
    @Body() body: { name?: unknown; customerIds?: unknown },
  ): Promise<ChannelSummary> {
    const s = sessionOf(req);
    return this.channels.createChannel({ userId: s.userId, role: s.role }, body ?? {});
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string): Promise<ChannelSummary> {
    return this.channels.getChannel(id, sessionOf(req).userId);
  }

  @Get(':id/messages')
  messages(@Req() req: Request, @Param('id') id: string): Promise<ChannelMessage[]> {
    return this.channels.listMessages(id, sessionOf(req).userId);
  }

  @Post(':id/messages')
  post(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { body?: unknown },
  ): Promise<ChannelMessage> {
    return this.channels.postMessage(id, sessionOf(req).userId, body?.body);
  }

  /** Server-sent events: new messages for members with the channel open. */
  @Sse(':id/stream')
  async stream(@Req() req: Request, @Param('id') id: string): Promise<Observable<MessageEvent>> {
    await this.channels.assertMember(id, sessionOf(req).userId);
    return this.channels.stream(id);
  }
}
