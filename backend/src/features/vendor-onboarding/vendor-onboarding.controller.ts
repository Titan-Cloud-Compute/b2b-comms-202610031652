import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { VendorOnboardingService } from './vendor-onboarding.service';
import type { UploadedVendorFile, VendorProfileInput } from './vendor-onboarding.service';

@ApiTags('vendor')
@UseGuards(JwtAuthGuard)
@Controller('api/vendor')
export class VendorOnboardingController {
  constructor(private readonly vendor: VendorOnboardingService) {}

  private userId(req: Request): string {
    const id = req.session?.userId;
    if (!id) throw new UnauthorizedException('not authenticated');
    return id;
  }

  @Get('profile')
  async getProfile(@Req() req: Request) {
    return { profile: await this.vendor.getProfile(this.userId(req)) };
  }

  @Put('profile')
  async saveProfile(@Req() req: Request, @Body() body: VendorProfileInput) {
    return { profile: await this.vendor.saveProfile(this.userId(req), body) };
  }

  @Get('documents')
  listDocuments(@Req() req: Request) {
    return this.vendor.listDocuments(this.userId(req));
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadDocument(@Req() req: Request, @UploadedFile() file: UploadedVendorFile) {
    return this.vendor.uploadDocument(this.userId(req), file);
  }
}
