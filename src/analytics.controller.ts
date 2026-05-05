import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('conversion-funnel')
  async getConversionFunnel() {
    return this.analyticsService.getConversionFunnel();
  }

  @Get('dropout-analysis')
  async getDropoutAnalysis() {
    return this.analyticsService.getDropoutAnalysis();
  }

  @Get('conversions')
  async getRecentConversions(@Query('limit') limit = 10) {
    return this.analyticsService.getRecentConversions(parseInt(limit.toString()));
  }

  @Get('dropouts')
  async getRecentDropouts(@Query('limit') limit = 10) {
    return this.analyticsService.getRecentDropouts(parseInt(limit.toString()));
  }

  @Get('tags/:tag')
  async getCustomersByTag(
    @Param('tag') tag: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.analyticsService.getCustomersByTag(
      tag,
      parseInt(page.toString()),
      parseInt(limit.toString()),
    );
  }

  @Get('customer/:userId')
  async getCustomerDetails(@Param('userId') userId: string) {
    const details = await this.analyticsService.getCustomerDetails(userId);
    if (!details) {
      return { error: 'Customer not found' };
    }
    return details;
  }

  @Get('search')
  async searchCustomers(
    @Query('q') query: string,
    @Query('limit') limit = 20,
  ) {
    if (!query || query.length < 2) {
      return { error: 'Query must be at least 2 characters' };
    }
    return this.analyticsService.searchCustomers(query, parseInt(limit.toString()));
  }
}
