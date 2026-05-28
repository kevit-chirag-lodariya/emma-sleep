/**
 * MongoDB collection: customers
 *
 * Populated by: sync-users-all-messages.js
 * Updated by:   analyze-with-openai.js, tag-users-with-ai-interaction.js
 */

export interface Classification {
  conversation_type: 'sales' | 'support' | 'mixed' | 'unclassified';
  sales_sub_type: 'new_inquiry' | 'repeat_buyer' | 'abandoned' | null;
  support_sub_type: 'delivery' | 'return_refund' | 'product_quality' | 'warranty' | 'payment_order' | 'general' | null;
  funnel_stage_reached: 'greeting' | 'need_discovery' | 'product_shown' | 'price_shared' | 'checkout_intent' | 'ordered' | null;
  resolution_signal: 'resolved' | 'unresolved' | 'escalated' | 'unknown' | null;
  order_placed: boolean;
  escalated_to_human: boolean;
  objection_keywords: string[];
  classifier_confidence: 'high' | 'medium' | 'low';
  classifier_notes: string;
}

export interface Customer {
  _id?: string;

  /** Netcore platform user ID (unique) */
  userId: string;

  /** WhatsApp/channel phone number or platform bot user ID */
  botUserId: string;

  name: string;
  email?: string | null;
  phoneNumber?: string | null;
  channelName: string;

  lastInteractedDate: Date;
  createdAt: Date;

  customFields: Record<string, unknown>;

  /** Tags added by scripts — e.g. 'ai-used', 'come-to-buy', 'dropped', etc. */
  tags: string[];

  /** Added by analyze-with-openai.js */
  classification?: Classification;

  /** Timestamp when classification was last run */
  classifiedAt?: Date;
}
