import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async getDashboardStats() {
    const [
      totalCustomers,
      customersWithAiUsed,
      conversionStats,
      tagDistribution,
      sentimentStats,
      intents,
    ] = await Promise.all([
      this.customerModel.countDocuments(),
      this.customerModel.countDocuments({ tags: 'ai-used' }),
      this.getConversionStats(),
      this.getTagDistribution(),
      this.getSentimentStats(),
      this.getIntentDistribution(),
    ]);

    return {
      timestamp: new Date(),
      overview: {
        totalCustomers,
        customersWithAiUsed,
        aiUsedPercentage: ((customersWithAiUsed / totalCustomers) * 100).toFixed(2),
      },
      conversionStats,
      tagDistribution,
      sentimentStats,
      intents,
    };
  }

  private async getConversionStats() {
    const pipeline: any[] = [
      {
        $facet: {
          conversionsCompleted: [
            { $match: { tags: 'conversion-completed' } },
            { $count: 'count' },
          ],
          dropped: [
            { $match: { tags: 'dropped' } },
            { $count: 'count' },
          ],
          comeToBuy: [
            { $match: { tags: 'come-to-buy' } },
            { $count: 'count' },
          ],
          comeToSupport: [
            { $match: { tags: 'come-to-support' } },
            { $count: 'count' },
          ],
          bought: [
            { $match: { tags: 'buy' } },
            { $count: 'count' },
          ],
        },
      },
    ];

    const result = await this.customerModel.aggregate(pipeline).exec();
    const stats = result[0];

    return {
      conversionsCompleted: stats.conversionsCompleted[0]?.count || 0,
      dropped: stats.dropped[0]?.count || 0,
      comeToBuy: stats.comeToBuy[0]?.count || 0,
      comeToSupport: stats.comeToSupport[0]?.count || 0,
      bought: stats.bought[0]?.count || 0,
      conversionRate: ((stats.conversionsCompleted[0]?.count || 0) / (stats.comeToBuy[0]?.count || 1) * 100).toFixed(2),
      dropoutRate: ((stats.dropped[0]?.count || 0) / (stats.comeToBuy[0]?.count || 1) * 100).toFixed(2),
    };
  }

  private async getTagDistribution() {
    const pipeline: any[] = [
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];

    return this.customerModel.aggregate(pipeline).exec();
  }

  private async getSentimentStats() {
    // Sentiment analysis based on customer messages and interactions
    const pipeline: any[] = [
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          withPositiveSentiment: {
            $sum: { $cond: [{ $in: ['positive', '$tags'] }, 1, 0] },
          },
          withNegativeSentiment: {
            $sum: { $cond: [{ $in: ['negative', '$tags'] }, 1, 0] },
          },
          highEngagement: {
            $sum: { $cond: [{ $in: ['engagement-high', '$tags'] }, 1, 0] },
          },
        },
      },
    ];

    const result = await this.customerModel.aggregate(pipeline).exec();
    const stats = result[0] || {};

    return {
      positive: stats.withPositiveSentiment || 0,
      negative: stats.withNegativeSentiment || 0,
      highEngagement: stats.highEngagement || 0,
      totalAnalyzed: stats.totalCustomers || 0,
    };
  }

  private async getIntentDistribution() {
    const pipeline: any[] = [
      {
        $facet: {
          buyIntent: [
            { $match: { tags: 'come-to-buy' } },
            { $count: 'count' },
          ],
          supportIntent: [
            { $match: { tags: 'come-to-support' } },
            { $count: 'count' },
          ],
          hybridIntent: [
            {
              $match: {
                tags: { $all: ['come-to-buy', 'come-to-support'] },
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ];

    const result = await this.customerModel.aggregate(pipeline).exec();
    const stats = result[0];

    return {
      buyIntent: stats.buyIntent[0]?.count || 0,
      supportIntent: stats.supportIntent[0]?.count || 0,
      hybridIntent: stats.hybridIntent[0]?.count || 0,
    };
  }

  async getCustomersByTag(tag: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.customerModel
        .find({ tags: tag })
        .skip(skip)
        .limit(limit)
        .sort({ lastInteractedDate: -1 })
        .exec(),
      this.customerModel.countDocuments({ tags: tag }),
    ]);

    return {
      data: customers,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getCustomerDetails(userId: string) {
    const [customer, messages] = await Promise.all([
      this.customerModel.findOne({ userId }).exec(),
      this.messageModel
        .find({ userId })
        .sort({ sentAt: 1 })
        .exec(),
    ]);

    if (!customer) {
      return null;
    }

    const messageCount = messages.length;
    const userMessages = messages.filter((m) => m.from === 'user').length;
    const botMessages = messages.length - userMessages;

    return {
      customer,
      messages: {
        total: messageCount,
        user: userMessages,
        bot: botMessages,
      },
      messageHistory: messages.map((m) => ({
        timestamp: m.sentAt,
        from: m.from,
        text: m.textMessage || m.type,
        type: m.type,
      })),
    };
  }

  async getDropoutAnalysis() {
    const pipeline: any[] = [
      { $match: { tags: 'dropped' } },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $regex: 'dropped-' } } },
      { $sort: { count: -1 } },
    ];

    const dropoutReasons = await this.customerModel.aggregate(pipeline).exec();

    return {
      totalDropped: (await this.customerModel.countDocuments({ tags: 'dropped' })),
      byReason: dropoutReasons.reduce(
        (acc, item) => {
          acc[item._id.replace('dropped-', '')] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  async getConversionFunnel() {
    const pipeline: any[] = [
      {
        $facet: {
          totalUsers: [{ $count: 'count' }],
          aiUsed: [{ $match: { tags: 'ai-used' } }, { $count: 'count' }],
          comeToBuy: [{ $match: { tags: 'come-to-buy' } }, { $count: 'count' }],
          comeToSupport: [{ $match: { tags: 'come-to-support' } }, { $count: 'count' }],
          viewed: [
            { $match: { tags: { $in: ['come-to-buy', 'come-to-support'] } } },
            { $count: 'count' },
          ],
          addedToCart: [
            { $match: { tags: { $all: ['come-to-buy'] } } },
            { $count: 'count' },
          ],
          checkoutInitiated: [
            { $match: { tags: { $in: ['dropped-at-payment', 'buy'] } } },
            { $count: 'count' },
          ],
          converted: [
            { $match: { tags: 'conversion-completed' } },
            { $count: 'count' },
          ],
        },
      },
    ];

    const result = await this.customerModel.aggregate(pipeline).exec();
    const funnel = result[0];

    const total = funnel.totalUsers[0]?.count || 0;

    return {
      stages: [
        {
          name: 'Total Users',
          count: total,
          percentage: 100,
        },
        {
          name: 'AI Used',
          count: funnel.aiUsed[0]?.count || 0,
          percentage: ((funnel.aiUsed[0]?.count || 0) / total * 100).toFixed(2),
        },
        {
          name: 'Viewed Products',
          count: funnel.viewed[0]?.count || 0,
          percentage: ((funnel.viewed[0]?.count || 0) / total * 100).toFixed(2),
        },
        {
          name: 'Added to Cart',
          count: funnel.addedToCart[0]?.count || 0,
          percentage: ((funnel.addedToCart[0]?.count || 0) / total * 100).toFixed(2),
        },
        {
          name: 'Checkout Initiated',
          count: funnel.checkoutInitiated[0]?.count || 0,
          percentage: ((funnel.checkoutInitiated[0]?.count || 0) / total * 100).toFixed(2),
        },
        {
          name: 'Converted',
          count: funnel.converted[0]?.count || 0,
          percentage: ((funnel.converted[0]?.count || 0) / total * 100).toFixed(2),
        },
      ],
    };
  }

  async getRecentConversions(limit = 10) {
    return this.customerModel
      .find({ tags: 'conversion-completed' })
      .sort({ lastInteractedDate: -1 })
      .limit(limit)
      .exec();
  }

  async getRecentDropouts(limit = 10) {
    return this.customerModel
      .find({ tags: 'dropped' })
      .sort({ lastInteractedDate: -1 })
      .limit(limit)
      .exec();
  }

  async searchCustomers(query: string, limit = 20) {
    return this.customerModel
      .find({
        $or: [
          { botUserId: { $regex: query, $options: 'i' } },
          { name: { $regex: query, $options: 'i' } },
          { userId: query },
        ],
      })
      .limit(limit)
      .exec();
  }
}
