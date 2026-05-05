import { Controller, Get, Query } from '@nestjs/common';
import { AdvancedAnalyticsService } from './advanced-analytics.service';

@Controller('advanced-analytics')
export class AdvancedAnalyticsController {
  constructor(private readonly advancedAnalyticsService: AdvancedAnalyticsService) {}

  @Get('funnel-dropoff')
  async getFunnelDropoff() {
    return this.advancedAnalyticsService.getFunnelDropoffAnalysis();
  }

  @Get('conversion-by-entry')
  async getConversionByEntry() {
    return this.advancedAnalyticsService.getConversionByEntryPoint();
  }

  @Get('time-to-decision')
  async getTimeToDecision() {
    return this.advancedAnalyticsService.getTimeToDecisionAnalysis();
  }

  @Get('bot-response-quality')
  async getBotQuality() {
    return this.advancedAnalyticsService.getBotResponseQualityAnalysis();
  }

  @Get('objections')
  async getObjections() {
    return this.advancedAnalyticsService.getObjectionAnalysis();
  }

  @Get('support-vs-buy')
  async getSupportVsBuy() {
    return this.advancedAnalyticsService.getSupportVsBuyAnalysis();
  }

  @Get('reengagement-opportunity')
  async getReengagement() {
    return this.advancedAnalyticsService.getReengagementOpportunity();
  }

  @Get('message-volume')
  async getMessageVolume() {
    return this.advancedAnalyticsService.getMessageVolumeAnalysis();
  }

  @Get('time-patterns')
  async getTimePatterns() {
    return this.advancedAnalyticsService.getTimePatternAnalysis();
  }

  @Get('language-analysis')
  async getLanguage() {
    return this.advancedAnalyticsService.getLanguageAnalysis();
  }

  @Get('all')
  async getAllAdvancedAnalytics() {
    const [
      funnelDropoff,
      conversionByEntry,
      timeToDecision,
      botQuality,
      objections,
      supportVsBuy,
      reengagement,
      messageVolume,
      timePatterns,
      language,
    ] = await Promise.all([
      this.advancedAnalyticsService.getFunnelDropoffAnalysis(),
      this.advancedAnalyticsService.getConversionByEntryPoint(),
      this.advancedAnalyticsService.getTimeToDecisionAnalysis(),
      this.advancedAnalyticsService.getBotResponseQualityAnalysis(),
      this.advancedAnalyticsService.getObjectionAnalysis(),
      this.advancedAnalyticsService.getSupportVsBuyAnalysis(),
      this.advancedAnalyticsService.getReengagementOpportunity(),
      this.advancedAnalyticsService.getMessageVolumeAnalysis(),
      this.advancedAnalyticsService.getTimePatternAnalysis(),
      this.advancedAnalyticsService.getLanguageAnalysis(),
    ]);

    return {
      timestamp: new Date(),
      metrics: {
        funnelDropoff,
        conversionByEntry,
        timeToDecision,
        botQuality,
        objections,
        supportVsBuy,
        reengagement,
        messageVolume,
        timePatterns,
        language,
      },
    };
  }
}
