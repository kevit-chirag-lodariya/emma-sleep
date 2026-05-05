import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getDashboard(@Res() res: Response) {
    return res.sendFile('dashboard.html', { root: 'public' });
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date() };
  }
}
