import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { Message, MessageDocument } from './schemas/message.schema';

interface RawUser {
  userId?: string;
  botUserId?: string;
  name?: string;
  channelName?: string;
  createdDate?: string;
  'first interacted date'?: string;
  'last interacted date'?: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
  [key: string]: unknown;
}

export interface RawMessage {
  from: 'user' | 'bot';
  type: string;
  text?: string;
  channelName?: string;
  sentAt?: string | Date;
  [key: string]: unknown;
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async upsertCustomers(rawUsers: RawUser[]): Promise<number> {
    let saved = 0;

    for (const user of rawUsers) {
      if (!user.userId) continue;

      await this.customerModel.findOneAndUpdate(
        { userId: user.userId },
        {
          userId: user.userId,
          botUserId: user.botUserId ?? '',
          name: user.name ?? '',
          channelName: user.channelName ?? '',
          createdDate: user.createdDate ? new Date(user.createdDate) : null,
          firstInteractedDate: user['first interacted date']
            ? new Date(user['first interacted date'])
            : null,
          lastInteractedDate: user['last interacted date']
            ? new Date(user['last interacted date'])
            : null,
          customFields: user.customFields ?? {},
          tags: user.tags ?? [],
        },
        { upsert: true, new: true },
      );

      saved += 1;
    }

    this.logger.log(`Upserted ${saved} customers`);
    return saved;
  }

  async saveMessage(
    userId: string,
    sessionId: string,
    raw: RawMessage,
  ): Promise<MessageDocument | null> {
    const customer = await this.customerModel.findOne({ userId });

    if (!customer) {
      this.logger.warn(`Customer not found for userId: ${userId}`);
      return null;
    }

    return this.messageModel.create({
      customerId: customer._id,
      userId,
      sessionId,
      from: raw.from,
      type: raw.type,
      channelName: raw.channelName ?? '',
      sentAt: raw.sentAt ? new Date(raw.sentAt as string) : new Date(),
      rawMessage: raw,
    });
  }

  async getCustomers(limit = 20, skip = 0): Promise<CustomerDocument[]> {
    return this.customerModel.find().skip(skip).limit(limit).sort({ lastInteractedDate: -1 }).exec();
  }

  async countCustomers(): Promise<number> {
    return this.customerModel.countDocuments().exec();
  }

  async bulkSaveMessages(
    messages: Array<Record<string, unknown>>,
  ): Promise<number> {
    if (!messages.length) return 0;
    const result = await this.messageModel.insertMany(messages, { ordered: false });
    return result.length;
  }

  async deleteMessagesByUserId(userId: string): Promise<void> {
    await this.messageModel.deleteMany({ userId }).exec();
  }

  async getMessagesByUser(userId: string): Promise<MessageDocument[]> {
    return this.messageModel.find({ userId }).sort({ sentAt: 1 }).exec();
  }

  async getCustomerByUserId(userId: string): Promise<CustomerDocument | null> {
    return this.customerModel.findOne({ userId }).exec();
  }
}
