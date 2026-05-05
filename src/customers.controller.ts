import { Controller, Get, Param, Query } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  async getCustomers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      this.databaseService.getCustomers(limitNum, skip),
      this.databaseService.countCustomers(),
    ]);

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    };
  }

  @Get(':userId')
  async getCustomerById(@Param('userId') userId: string) {
    return this.databaseService.getCustomerByUserId(userId);
  }

  @Get(':userId/messages')
  async getCustomerMessages(@Param('userId') userId: string) {
    const messages = await this.databaseService.getMessagesByUser(userId);
    return { data: messages, total: messages.length };
  }
}
