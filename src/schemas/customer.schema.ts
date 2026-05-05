import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerDocument = Customer & Document;

@Schema({ collection: 'customers', timestamps: true })
export class Customer {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  botUserId: string;

  @Prop()
  name: string;

  @Prop()
  channelName: string;

  @Prop()
  createdDate: Date;

  @Prop()
  firstInteractedDate: Date;

  @Prop()
  lastInteractedDate: Date;

  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
