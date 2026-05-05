import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class AdvancedAnalyticsService {
  private readonly logger = new Logger(AdvancedAnalyticsService.name);

  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  // 1. Funnel Drop-off Analysis - Exact step where users stop
  async getFunnelDropoffAnalysis() {
    const pipeline: any[] = [
      {
        $group: {
          _id: '$userId',
          messages: {
            $push: {
              from: '$from',
              text: '$textMessage',
              type: '$type',
              timestamp: '$sentAt',
            },
          },
          lastMessageFrom: { $last: '$from' },
          totalMessages: { $sum: 1 },
          tags: { $first: { $literal: [] } }, // Will be filled with lookup
        },
      },
      { $sort: { totalMessages: 1 } },
    ];

    const users = await this.messageModel.aggregate(pipeline).exec();

    const analysis = {
      dropAfterFirstBotMessage: 0,
      dropAfterProductView: 0,
      dropAfterPriceShown: 0,
      dropAfterAddressRequest: 0,
      dropAfterPayment: 0,
      completedFull: 0,
      stepsBreakdown: {} as Record<string, number>,
    };

    // Get customer tags for each user
    const userTags = await this.customerModel
      .find({}, { userId: 1, tags: 1 })
      .exec();

    const tagsMap = new Map(userTags.map((u) => [u.userId, u.tags || []]));

    for (const user of users) {
      const tags = tagsMap.get(user._id) || [];
      const isConverted = tags.includes('conversion-completed');

      if (isConverted) {
        analysis.completedFull++;
        continue;
      }

      // Analyze message content to determine where user dropped
      const conversationText = user.messages
        .map((m: any) => m.text || m.type)
        .join(' ')
        .toLowerCase();

      if (user.messages.length === 1) {
        analysis.dropAfterFirstBotMessage++;
      } else if (
        conversationText.includes('price') ||
        conversationText.includes('cost') ||
        conversationText.includes('rs')
      ) {
        analysis.dropAfterPriceShown++;
      } else if (
        conversationText.includes('address') ||
        conversationText.includes('location') ||
        conversationText.includes('delivery')
      ) {
        analysis.dropAfterAddressRequest++;
      } else if (
        conversationText.includes('payment') ||
        conversationText.includes('pay') ||
        conversationText.includes('card')
      ) {
        analysis.dropAfterPayment++;
      } else if (conversationText.includes('product') || conversationText.includes('mattress')) {
        analysis.dropAfterProductView++;
      }
    }

    return analysis;
  }

  // 2. Conversion Rate by Entry Point / Campaign Source
  async getConversionByEntryPoint() {
    const customers = await this.customerModel.find({}).exec();

    const analysis = {
      bySource: {} as Record<string, { total: number; converted: number; rate: string }>,
      byCampaign: {} as Record<string, { total: number; converted: number; rate: string }>,
    };

    for (const customer of customers) {
      const source: string = (customer.channelName as string) || 'direct';
      const campaign: string = (customer.customFields?.campaign as string) || 'organic';

      // Initialize if not exists
      if (!analysis.bySource[source]) {
        analysis.bySource[source] = { total: 0, converted: 0, rate: '0' };
      }
      if (!analysis.byCampaign[campaign]) {
        analysis.byCampaign[campaign] = { total: 0, converted: 0, rate: '0' };
      }

      (analysis.bySource[source] as any).total++;
      (analysis.byCampaign[campaign] as any).total++;

      if (customer.tags?.includes('conversion-completed')) {
        (analysis.bySource[source] as any).converted++;
        (analysis.byCampaign[campaign] as any).converted++;
      }
    }

    // Calculate rates
    for (const source in analysis.bySource) {
      const item = analysis.bySource[source];
      item.rate = ((item.converted / item.total) * 100).toFixed(2);
    }
    for (const campaign in analysis.byCampaign) {
      const item = analysis.byCampaign[campaign];
      item.rate = ((item.converted / item.total) * 100).toFixed(2);
    }

    return analysis;
  }

  // 3. Time-to-Decision Analysis
  async getTimeToDecisionAnalysis() {
    const pipeline: any[] = [
      {
        $group: {
          _id: '$userId',
          firstMessage: { $min: '$sentAt' },
          lastMessage: { $max: '$sentAt' },
          messageCount: { $sum: 1 },
          isConverted: {
            $push: { $cond: [{ $eq: ['$from', 'user'] }, '$textMessage', null] },
          },
        },
      },
    ];

    const users = await this.messageModel.aggregate(pipeline).exec();

    const convertedUsers: any[] = [];
    const droppedUsers: any[] = [];

    // Get customer tags
    const customers = await this.customerModel.find({}, { userId: 1, tags: 1 }).exec();
    const tagsMap = new Map(customers.map((c) => [c.userId, c.tags || []]));

    for (const user of users) {
      const tags = tagsMap.get(user._id) || [];
      const isConverted = tags.includes('conversion-completed');

      const timeDiff = new Date(user.lastMessage).getTime() - new Date(user.firstMessage).getTime();
      const minutes = Math.round(timeDiff / 60000);
      const hours = (minutes / 60).toFixed(1);

      const record = {
        userId: user._id,
        durationMinutes: minutes,
        durationHours: hours,
        messageCount: user.messageCount,
      };

      if (isConverted) {
        convertedUsers.push(record);
      } else {
        droppedUsers.push(record);
      }
    }

    const avgConvertedTime =
      convertedUsers.reduce((sum, u) => sum + u.durationMinutes, 0) / convertedUsers.length || 0;
    const avgDroppedTime =
      droppedUsers.reduce((sum, u) => sum + u.durationMinutes, 0) / droppedUsers.length || 0;

    return {
      convertedUsers: {
        count: convertedUsers.length,
        averageDurationMinutes: Math.round(avgConvertedTime),
        averageDurationHours: (avgConvertedTime / 60).toFixed(1),
        averageMessages: Math.round(
          convertedUsers.reduce((sum, u) => sum + u.messageCount, 0) / convertedUsers.length || 0,
        ),
        samples: convertedUsers.slice(0, 5),
      },
      droppedUsers: {
        count: droppedUsers.length,
        averageDurationMinutes: Math.round(avgDroppedTime),
        averageDurationHours: (avgDroppedTime / 60).toFixed(1),
        averageMessages: Math.round(
          droppedUsers.reduce((sum, u) => sum + u.messageCount, 0) / droppedUsers.length || 0,
        ),
        samples: droppedUsers.slice(0, 5),
      },
      insight: this.generateTimeInsight(avgConvertedTime, avgDroppedTime),
    };
  }

  // 4. Bot Response Quality - Failed/Repeated Questions
  async getBotResponseQualityAnalysis() {
    const messages = await this.messageModel.find({}).sort({ sentAt: 1 }).exec();

    const analysis = {
      repeatedQuestions: [] as { question: string; count: number }[],
      confusionIndicators: 0,
      clarificationRequests: 0,
      botErrorResponses: 0,
      qualityIssuesByUser: {} as Record<string, any>,
    };

    const userConversations = new Map<string, any>();

    for (const msg of messages) {
      if (!userConversations.has(msg.userId)) {
        userConversations.set(msg.userId, { messages: [] });
      }
      userConversations.get(msg.userId).messages.push(msg);
    }

    // Analyze quality issues
    const questionMap = new Map<string, number>();

    for (const [userId, data] of userConversations) {
      const userMsgs = data.messages;
      let qualityIssues = 0;

      for (let i = 0; i < userMsgs.length; i++) {
        const msg = userMsgs[i];
        const text = (msg.textMessage || '').toLowerCase();

        // Check for confusion indicators
        if (
          text.includes("what") ||
          text.includes("huh") ||
          text.includes("i don't understand") ||
          text.includes("repeat") ||
          text.includes("again") ||
          text.includes("confused")
        ) {
          analysis.confusionIndicators++;
          qualityIssues++;
        }

        // Check for clarification requests
        if (text.includes("?") && text.length < 50) {
          analysis.clarificationRequests++;
        }

        // Check for repeated similar messages
        if (i > 0) {
          const prevText = (userMsgs[i - 1].textMessage || '').toLowerCase();
          if (this.similarity(text, prevText) > 0.7) {
            analysis.repeatedQuestions.push({ question: text.substring(0, 50), count: 1 });
            qualityIssues++;
          }
        }
      }

      if (qualityIssues > 0) {
        analysis.qualityIssuesByUser[userId] = qualityIssues;
      }
    }

    return analysis;
  }

  // 5. Objection Analysis - Why users drop
  async getObjectionAnalysis() {
    const messages = await this.messageModel.find({}).exec();

    const objections = {
      priceTooHigh: 0,
      deliveryTimeConcern: 0,
      trustIssue: 0,
      productConfusion: 0,
      paymentMethodNotAvailable: 0,
      otherObjections: 0,
      totalObjections: 0,
    };

    const objectionsByUser: Record<string, string[]> = {};

    for (const msg of messages) {
      const text = (msg.textMessage || '').toLowerCase();

      if (
        text.includes('price') ||
        text.includes('expensive') ||
        text.includes('cost') ||
        text.includes('cheap') ||
        text.includes('afford')
      ) {
        objections.priceTooHigh++;
        objectionsByUser[msg.userId] = objectionsByUser[msg.userId] || [];
        objectionsByUser[msg.userId].push('price');
      }

      if (
        text.includes('delivery') ||
        text.includes('shipping') ||
        text.includes('how long') ||
        text.includes('days')
      ) {
        objections.deliveryTimeConcern++;
        objectionsByUser[msg.userId] = objectionsByUser[msg.userId] || [];
        objectionsByUser[msg.userId].push('delivery');
      }

      if (
        text.includes('trust') ||
        text.includes('real') ||
        text.includes('fake') ||
        text.includes('legit') ||
        text.includes('scam')
      ) {
        objections.trustIssue++;
        objectionsByUser[msg.userId] = objectionsByUser[msg.userId] || [];
        objectionsByUser[msg.userId].push('trust');
      }

      if (
        text.includes('confused') ||
        text.includes('understand') ||
        text.includes('specification') ||
        text.includes('features')
      ) {
        objections.productConfusion++;
        objectionsByUser[msg.userId] = objectionsByUser[msg.userId] || [];
        objectionsByUser[msg.userId].push('product');
      }

      if (
        text.includes('payment') ||
        text.includes('card') ||
        text.includes('upi') ||
        text.includes('wallet')
      ) {
        objections.paymentMethodNotAvailable++;
        objectionsByUser[msg.userId] = objectionsByUser[msg.userId] || [];
        objectionsByUser[msg.userId].push('payment');
      }
    }

    objections.totalObjections =
      objections.priceTooHigh +
      objections.deliveryTimeConcern +
      objections.trustIssue +
      objections.productConfusion +
      objections.paymentMethodNotAvailable;

    return {
      ...objections,
      percentages: {
        price: ((objections.priceTooHigh / objections.totalObjections) * 100).toFixed(2),
        delivery: ((objections.deliveryTimeConcern / objections.totalObjections) * 100).toFixed(2),
        trust: ((objections.trustIssue / objections.totalObjections) * 100).toFixed(2),
        product: ((objections.productConfusion / objections.totalObjections) * 100).toFixed(2),
        payment: ((objections.paymentMethodNotAvailable / objections.totalObjections) * 100)
          .toFixed(2),
      },
      usersWithObjections: Object.keys(objectionsByUser).length,
    };
  }

  // 6. Support vs Buy Intent - Conversion within support users
  async getSupportVsBuyAnalysis() {
    const customers = await this.customerModel.find({}).exec();

    const analysis = {
      buyIntent: {
        total: 0,
        converted: 0,
        conversionRate: '0',
        avgMessagesPerUser: 0,
      },
      supportIntent: {
        total: 0,
        converted: 0,
        conversionRate: '0',
        avgMessagesPerUser: 0,
      },
      hybridIntent: {
        total: 0,
        converted: 0,
        conversionRate: '0',
        avgMessagesPerUser: 0,
      },
      supportUsersBought: 0,
      warmLeadOpportunity: 0,
    };

    // Get message counts for each user
    const messageCounts: Record<string, number> = {};
    const messages = await this.messageModel.find({}).exec();
    for (const msg of messages) {
      messageCounts[msg.userId] = (messageCounts[msg.userId] || 0) + 1;
    }

    for (const customer of customers) {
      const isBuy = customer.tags?.includes('come-to-buy') || false;
      const isSupport = customer.tags?.includes('come-to-support') || false;
      const isConverted = customer.tags?.includes('conversion-completed') || false;

      const msgCount = messageCounts[customer.userId] || 0;

      if (isBuy && isSupport) {
        analysis.hybridIntent.total++;
        if (isConverted) analysis.hybridIntent.converted++;
        analysis.hybridIntent.avgMessagesPerUser += msgCount;
      } else if (isBuy) {
        analysis.buyIntent.total++;
        if (isConverted) analysis.buyIntent.converted++;
        analysis.buyIntent.avgMessagesPerUser += msgCount;
      } else if (isSupport) {
        analysis.supportIntent.total++;
        if (isConverted) {
          analysis.supportIntent.converted++;
          analysis.supportUsersBought++;
        }
        analysis.supportIntent.avgMessagesPerUser += msgCount;
      }
    }

    // Calculate averages and rates
    if (analysis.buyIntent.total > 0) {
      analysis.buyIntent.conversionRate = (
        (analysis.buyIntent.converted / analysis.buyIntent.total) *
        100
      ).toFixed(2);
      analysis.buyIntent.avgMessagesPerUser = Math.round(
        analysis.buyIntent.avgMessagesPerUser / analysis.buyIntent.total,
      );
    }

    if (analysis.supportIntent.total > 0) {
      analysis.supportIntent.conversionRate = (
        (analysis.supportIntent.converted / analysis.supportIntent.total) *
        100
      ).toFixed(2);
      analysis.supportIntent.avgMessagesPerUser = Math.round(
        analysis.supportIntent.avgMessagesPerUser / analysis.supportIntent.total,
      );
      // Support users who didn't buy but engaged are warm leads
      analysis.warmLeadOpportunity =
        analysis.supportIntent.total - analysis.supportIntent.converted;
    }

    if (analysis.hybridIntent.total > 0) {
      analysis.hybridIntent.conversionRate = (
        (analysis.hybridIntent.converted / analysis.hybridIntent.total) *
        100
      ).toFixed(2);
      analysis.hybridIntent.avgMessagesPerUser = Math.round(
        analysis.hybridIntent.avgMessagesPerUser / analysis.hybridIntent.total,
      );
    }

    return analysis;
  }

  // 7. Re-engagement Opportunity - Hot lost leads
  async getReengagementOpportunity() {
    const messages = await this.messageModel
      .find({ from: 'user' })
      .sort({ sentAt: 1 })
      .exec();

    const userProgressMap = new Map<string, number>();

    for (const msg of messages) {
      const progress = userProgressMap.get(msg.userId) || 0;
      userProgressMap.set(msg.userId, progress + 1);
    }

    // Get dropped users
    const droppedCustomers = await this.customerModel
      .find({ tags: 'dropped' })
      .exec();

    const hotLeads: any[] = [];
    const totalMessages = await this.messageModel.countDocuments().exec();

    for (const customer of droppedCustomers) {
      const userMsgs = userProgressMap.get(customer.userId) || 0;
      const progressPercentage = (userMsgs / totalMessages) * 100;

      // Hot leads = users who completed 60%+ of conversation but still dropped
      if (progressPercentage >= 60) {
        hotLeads.push({
          userId: customer.userId,
          phone: customer.botUserId,
          name: customer.name,
          progressPercentage: progressPercentage.toFixed(2),
          messagesSent: userMsgs,
          droppedReason: customer.tags
            ?.find((t) => t.startsWith('dropped-'))
            ?.replace('dropped-', ''),
        });
      }
    }

    return {
      totalDroppedUsers: droppedCustomers.length,
      hotLeads: hotLeads.sort(
        (a: any, b: any) =>
          parseFloat(b.progressPercentage) - parseFloat(a.progressPercentage),
      ),
      hotLeadsCount: hotLeads.length,
      recoveryPotential: ((hotLeads.length / droppedCustomers.length) * 100).toFixed(2),
    };
  }

  // 8. Message Volume per User
  async getMessageVolumeAnalysis() {
    const pipeline: any[] = [
      {
        $group: {
          _id: '$userId',
          totalMessages: { $sum: 1 },
          userMessages: { $sum: { $cond: [{ $eq: ['$from', 'user'] }, 1, 0] } },
          botMessages: { $sum: { $cond: [{ $eq: ['$from', 'bot'] }, 1, 0] } },
        },
      },
    ];

    const userMessages = await this.messageModel.aggregate(pipeline).exec();

    const customers = await this.customerModel.find({}).exec();
    const tagsMap = new Map(customers.map((c) => [c.userId, c.tags || []]));

    const convertedStats = { total: 0, userMsgs: 0, botMsgs: 0, count: 0 };
    const droppedStats = { total: 0, userMsgs: 0, botMsgs: 0, count: 0 };

    for (const user of userMessages) {
      const tags = tagsMap.get(user._id) || [];
      const isConverted = tags.includes('conversion-completed');

      if (isConverted) {
        convertedStats.total += user.totalMessages;
        convertedStats.userMsgs += user.userMessages;
        convertedStats.botMsgs += user.botMessages;
        convertedStats.count++;
      } else if (tags.includes('dropped')) {
        droppedStats.total += user.totalMessages;
        droppedStats.userMsgs += user.userMessages;
        droppedStats.botMsgs += user.botMessages;
        droppedStats.count++;
      }
    }

    return {
      converted: {
        averageTotalMessages: Math.round(convertedStats.total / convertedStats.count || 0),
        averageUserMessages: Math.round(convertedStats.userMsgs / convertedStats.count || 0),
        averageBotMessages: Math.round(convertedStats.botMsgs / convertedStats.count || 0),
        ratio: (
          (convertedStats.userMsgs / convertedStats.botMsgs) *
          100
        ).toFixed(2),
      },
      dropped: {
        averageTotalMessages: Math.round(droppedStats.total / droppedStats.count || 0),
        averageUserMessages: Math.round(droppedStats.userMsgs / droppedStats.count || 0),
        averageBotMessages: Math.round(droppedStats.botMsgs / droppedStats.count || 0),
        ratio: (
          (droppedStats.userMsgs / droppedStats.botMsgs) *
          100
        ).toFixed(2),
      },
      insight: this.generateMessageVolumeInsight(
        Math.round(convertedStats.total / convertedStats.count || 0),
        Math.round(droppedStats.total / droppedStats.count || 0),
      ),
    };
  }

  // 9. Time of Day / Day of Week Patterns
  async getTimePatternAnalysis() {
    const messages = await this.messageModel.find({}).exec();

    const timeOfDay: Record<string, number> = {};
    const dayOfWeek: Record<string, number> = {};
    const conversionsByTime: Record<string, number> = {};
    const dropoutsByTime: Record<string, number> = {};

    const customers = await this.customerModel.find({}).exec();
    const tagsMap = new Map(customers.map((c) => [c.userId, c.tags || []]));

    for (const msg of messages) {
      const date = new Date(msg.sentAt);
      const hour = date.getHours();
      const day = date.toLocaleDateString('en-US', { weekday: 'short' });

      const timeSlot = `${hour}:00`;
      timeOfDay[timeSlot] = (timeOfDay[timeSlot] || 0) + 1;
      dayOfWeek[day] = (dayOfWeek[day] || 0) + 1;

      const tags = tagsMap.get(msg.userId) || [];
      if (tags.includes('conversion-completed')) {
        conversionsByTime[timeSlot] = (conversionsByTime[timeSlot] || 0) + 1;
      }
      if (tags.includes('dropped')) {
        dropoutsByTime[timeSlot] = (dropoutsByTime[timeSlot] || 0) + 1;
      }
    }

    return {
      peakHours: Object.entries(timeOfDay)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([hour, count]) => ({
          hour,
          messages: count,
          conversions: conversionsByTime[hour] || 0,
          dropouts: dropoutsByTime[hour] || 0,
        })),
      lowHours: Object.entries(timeOfDay)
        .sort(([, a], [, b]) => a - b)
        .slice(0, 3)
        .map(([hour, count]) => ({ hour, messages: count })),
      dayOfWeekPattern: dayOfWeek,
    };
  }

  // 10. Language & Communication Style Analysis
  async getLanguageAnalysis() {
    const messages = await this.messageModel.find({}).exec();

    const languageIndicators: Record<string, number> = {
      hindi: 0,
      gujarati: 0,
      english: 0,
      mixed: 0,
    };

    const userLanguages: Record<string, any> = {};
    const customers = await this.customerModel.find({}).exec();
    const tagsMap = new Map(customers.map((c) => [c.userId, c.tags || []]));

    for (const msg of messages) {
      if (!msg.textMessage) continue;

      const text = msg.textMessage;
      let detectedLanguage = this.detectLanguage(text);

      languageIndicators[detectedLanguage]++;

      if (!userLanguages[msg.userId]) {
        userLanguages[msg.userId] = {
          languages: new Set(),
          messages: 0,
          isConverted: tagsMap.get(msg.userId)?.includes('conversion-completed') || false,
        };
      }

      userLanguages[msg.userId].languages.add(detectedLanguage);
      userLanguages[msg.userId].messages++;
    }

    // Analyze conversion by language preference
    const conversionByLanguage: Record<string, { total: number; converted: number; rate: string }> =
      {
        hindi: { total: 0, converted: 0, rate: '0' },
        gujarati: { total: 0, converted: 0, rate: '0' },
        english: { total: 0, converted: 0, rate: '0' },
        mixed: { total: 0, converted: 0, rate: '0' },
      };

    for (const userId in userLanguages) {
      const user = userLanguages[userId];
      const primaryLanguage: string =
        user.languages.size > 1 ? 'mixed' : (Array.from(user.languages)[0] as string) || 'english';

      if (conversionByLanguage[primaryLanguage]) {
        conversionByLanguage[primaryLanguage].total++;
        if (user.isConverted) {
          conversionByLanguage[primaryLanguage].converted++;
        }
      }
    }

    for (const lang in conversionByLanguage) {
      const item = conversionByLanguage[lang];
      item.rate =
        item.total > 0 ? ((item.converted / item.total) * 100).toFixed(2) : '0';
    }

    return {
      languageDistribution: languageIndicators,
      conversionByLanguage,
      insight: 'Language analysis to personalize bot communication',
    };
  }

  // Helper methods
  private similarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const costs: number[] = [];
    for (let k = 0; k <= str1.length; k++) {
      let lastValue = k;
      for (let k2 = 0; k2 <= str2.length; k2++) {
        let newValue = k2;
        if (str1.charAt(k - 1) === str2.charAt(k2 - 1)) {
          newValue = lastValue;
        } else {
          newValue = Math.min(Math.min(newValue + 1, lastValue + 1), (costs[k2] || 0) + 1);
        }
        costs[k2] = lastValue;
        lastValue = newValue;
      }
      costs[str1.length] = lastValue;
    }
    return costs[str2.length] || 0;
  }

  private detectLanguage(text: string): string {
    // Hindi Unicode range: 0x0900 to 0x097F
    const hindiRegex = /[ऀ-ॿ]/g;
    // Gujarati Unicode range: 0x0A80 to 0x0AFF
    const gujaratiRegex = /[઀-૿]/g;

    const hindiMatch = (text.match(hindiRegex) || []).length;
    const gujaratiMatch = (text.match(gujaratiRegex) || []).length;

    if (hindiMatch > gujaratiMatch && hindiMatch > 0) return 'hindi';
    if (gujaratiMatch > hindiMatch && gujaratiMatch > 0) return 'gujarati';
    if (hindiMatch > 0 && gujaratiMatch > 0) return 'mixed';

    return 'english';
  }

  private generateTimeInsight(convertedAvg: number, droppedAvg: number): string {
    const ratio = convertedAvg / droppedAvg;
    if (ratio < 1) {
      return 'Converted users take longer - your bot is thorough but may be losing impatient users';
    } else if (ratio > 2) {
      return 'Converted users are much faster - good qualification, fast decision makers';
    }
    return 'Time to conversion is similar - bot engagement level is consistent';
  }

  private generateMessageVolumeInsight(convertedAvg: number, droppedAvg: number): string {
    if (convertedAvg < 5) {
      return 'Buyers decide very quickly - focus on first impression';
    } else if (convertedAvg > 20) {
      return 'Conversation is very detailed - may be too complex for some users';
    }
    return 'Good balance between qualification and simplicity';
  }
}
