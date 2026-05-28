/**
 * MongoDB collection: messages
 *
 * Populated by: sync-users-all-messages.js
 */

export interface Message {
  _id?: string;

  /** References customers.userId */
  customerId: string;

  /** WhatsApp/channel phone number */
  botUserId: string;

  createdAt: Date;

  /** 'user' = customer, 'Bot' | 'aiAgent' = bot-side */
  from: string;

  type: string;

  /** Set to true for system/config messages that should be excluded from analysis */
  isConfigMessage?: boolean;

  // Dynamic content field — key matches the `type` value
  // e.g. if type === 'text', then message.text = { message: '...' }
  [key: string]: unknown;

  // ── Common content types ─────────────────────────────────

  text?: { message: string };

  reply?: {
    body: string;
    header?: { text?: string; url?: string };
    actions?: Record<string, unknown>;
  };

  list?: {
    body: string;
    header?: { text?: string };
    actions?: Record<string, unknown>;
  };

  image?: {
    url: string;
    caption?: string;
  };

  attachment?: {
    url: string;
    contentType?: string;
    isVoice?: boolean;
  };

  location?: {
    latitude: string;
    longitude: string;
    label?: string;
    address?: string;
  };

  tag?: {
    id: string;
    name: string;
    type: string;
    action?: string;
    flowId?: string;
    flowName?: string;
  };

  order?: {
    catalogId: string;
    items: Record<string, unknown>[];
  };

  aiAction?: Record<string, unknown>[];

  aiAgentClearContext?: {
    flowId: string;
    flowName: string;
  };
}
