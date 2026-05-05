import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ collection: 'messages', timestamps: true })
export class Message {
  // ── Core fields ──────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, enum: ['user', 'bot'] })
  from: 'user' | 'bot';

  // Raw from value exactly as returned by API (User/Bot/aiAgent etc.)
  @Prop()
  fromRaw: string;

  @Prop({ required: true, index: true })
  type: string;

  @Prop()
  channelName: string;

  @Prop({ index: true })
  sentAt: Date;

  @Prop({ default: false })
  isConfigMessage: boolean;

  @Prop({ default: false })
  isFromAgent: boolean;

  @Prop({ default: false })
  isPreviewUser: boolean;

  @Prop({ default: false })
  isTemplateSentFromFlow: boolean;

  // ── Flattened: text ──────────────────────────────────────
  @Prop()
  textMessage: string;

  // ── Flattened: reply ─────────────────────────────────────
  @Prop()
  replyBody: string;

  @Prop()
  replyHeaderText: string;

  @Prop()
  replyHeaderUrl: string;

  @Prop({ type: Object })
  replyActions: Record<string, unknown>;

  // ── Flattened: list ──────────────────────────────────────
  @Prop()
  listBody: string;

  @Prop()
  listHeaderText: string;

  @Prop({ type: Object })
  listActions: Record<string, unknown>;

  // ── Flattened: image ─────────────────────────────────────
  @Prop()
  imageUrl: string;

  @Prop()
  imageCaption: string;

  // ── Flattened: attachment ────────────────────────────────
  @Prop()
  attachmentUrl: string;

  @Prop()
  attachmentContentType: string;

  @Prop({ default: false })
  attachmentIsVoice: boolean;

  // ── Flattened: location ──────────────────────────────────
  @Prop()
  locationLatitude: string;

  @Prop()
  locationLongitude: string;

  @Prop()
  locationLabel: string;

  @Prop()
  locationAddress: string;

  // ── Flattened: locationRequest ───────────────────────────
  @Prop()
  locationRequestBody: string;

  // ── Flattened: tag ───────────────────────────────────────
  @Prop()
  tagId: string;

  @Prop()
  tagName: string;

  @Prop()
  tagType: string;

  @Prop()
  tagAction: string;

  @Prop()
  tagFlowId: string;

  @Prop()
  tagFlowName: string;

  // ── Flattened: order ─────────────────────────────────────
  @Prop()
  orderCatalogId: string;

  @Prop({ type: [Object] })
  orderItems: Record<string, unknown>[];

  // ── Flattened: orderPaymentMessage ───────────────────────
  @Prop()
  orderPaymentBody: string;

  @Prop()
  orderPaymentReferenceId: string;

  @Prop()
  orderPaymentStatus: string;

  @Prop({ type: Object })
  orderPaymentAmount: Record<string, unknown>;

  // ── Flattened: paymentStatus ─────────────────────────────
  @Prop()
  paymentStatusReferenceId: string;

  @Prop()
  paymentStatusValue: string;

  // ── Flattened: whatsappFlow ──────────────────────────────
  @Prop()
  whatsappFlowBody: string;

  @Prop()
  whatsappFlowId: string;

  @Prop()
  whatsappFlowName: string;

  @Prop()
  whatsappFlowActionButtonText: string;

  // ── Flattened: aiAction ──────────────────────────────────
  @Prop({ type: [Object] })
  aiActions: Record<string, unknown>[];

  // ── Flattened: aiAgentClearContext ───────────────────────
  @Prop()
  aiAgentFlowId: string;

  @Prop()
  aiAgentFlowName: string;

  // ── Flattened: callPermissionReply ───────────────────────
  @Prop()
  callPermissionStatus: string;

  // ── Flattened: messageDetails ────────────────────────────
  @Prop()
  messageSource: string;

  @Prop()
  messageSourceType: string;

  // ── Raw document ─────────────────────────────────────────
  @Prop({ type: Object })
  rawMessage: Record<string, unknown>;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
