import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from './database.service';

const AUTH_ENDPOINT = '/login';
const USERS_ENDPOINT = '/users';
const TRANSCRIPTS_ENDPOINT = '/transcripts';
const AUTH_TOKEN_PATH = 'authToken';

// Correct channel ID mapping per API spec
const CHANNEL_IDS = {
  webchat: 1010,
  whatsapp: 1014,
  telegram: 1016,
  facebook: 1017,
  instagram: 1021,
};
const USER_CHANNEL_IDS = Object.values(CHANNEL_IDS);

const USERS_PAGE_LIMIT = 100;
const USERS_MAX_WINDOW_DAYS = 5;
const SYNC_START_DATE = '2026-04-14T00:00:00.000Z';
const DEFAULT_MAX_USERS = 100;
const MAX_PAGES_FOR_SYNC = 5;

interface NetcoreUsersResponse {
  users?: unknown[];
  page?: number;
  pages?: number;
  total?: number;
  limit?: number;
  hasNextPage?: boolean | number;
}

interface RawTranscriptMessage {
  from?: string;
  type?: string;
  text?: { message?: string };
  createdAt?: string;
  [key: string]: unknown;
}

interface NetcoreTranscriptsResponse {
  botUser?: {
    customFields?: Record<string, unknown>;
    tags?: string[];
  };
  transcripts?: RawTranscriptMessage[];
  paginationDetails?: {
    page: number;
    pages: number;
    total: number;
    limit: number;
  };
}

interface DateWindow {
  startDate: string;
  endDate: string;
}

interface SyncUsersOptions {
  includeUsers?: boolean;
  maxWindows?: number;
  maxUsers?: number;
}

@Injectable()
export class UsersService {
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  private async withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries) {
          break;
        }
        const delay = this.retryDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(
      `${label} failed after ${this.maxRetries} attempts: ${this.formatError(lastError)}`,
    );
  }

  private formatError(error: unknown): string {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;
      return `HTTP ${status ?? 'unknown'} ${JSON.stringify(data)}`;
    }

    return error instanceof Error ? error.message : String(error);
  }

  private buildDateWindows(startDate: Date, endDate: Date): DateWindow[] {
    const windows: DateWindow[] = [];
    let cursor = new Date(startDate);

    while (cursor < endDate) {
      const windowEnd = new Date(cursor);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + USERS_MAX_WINDOW_DAYS);

      const actualEnd = windowEnd < endDate ? windowEnd : endDate;

      windows.push({
        startDate: cursor.toISOString(),
        endDate: actualEnd.toISOString(),
      });

      cursor = new Date(actualEnd.getTime() + 1);
    }

    return windows;
  }

  private async getAccessToken(baseUrl: string): Promise<string> {
    const appId = this.configService.get<string>('NETCORE_APP_ID');
    const appSecret = this.configService.get<string>('NETCORE_APP_SECRET');

    if (!appId || !appSecret) {
      throw new Error('Missing NETCORE_APP_ID or NETCORE_APP_SECRET');
    }

    const loginUrl = `${baseUrl.replace(/\/$/, '')}/${AUTH_ENDPOINT.replace(/^\//, '')}`;

    const authResponse = await this.withRetry(
      () =>
        firstValueFrom(
          this.httpService.post(
            loginUrl,
            { appId, appSecret },
            {
              headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
              },
            },
          ),
        ),
      'Login request',
    );

    const token = AUTH_TOKEN_PATH
      .split('.')
      .reduce<unknown>(
        (acc, key) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[key]
            : undefined,
        authResponse.data,
      );

    if (!token || typeof token !== 'string') {
      throw new Error(
        `Unable to read token from auth response using AUTH_TOKEN_PATH=${AUTH_TOKEN_PATH}`,
      );
    }

    return token;
  }

  private async fetchUsersPage(
    baseUrl: string,
    token: string,
    window: DateWindow,
    page: number,
    limit: number,
  ): Promise<NetcoreUsersResponse> {
    const url = `${baseUrl.replace(/\/$/, '')}/${USERS_ENDPOINT.replace(/^\//, '')}`;

    const response = await this.withRetry(
      () =>
        firstValueFrom(
          this.httpService.post<NetcoreUsersResponse>(
            url,
            {
              channelIds: USER_CHANNEL_IDS,
              startDate: window.startDate,
              endDate: window.endDate,
            },
            {
              headers: {
                Authorization: token,
                accept: 'application/json',
                'Content-Type': 'application/json',
              },
              params: { page, limit },
            },
          ),
        ),
      `Users fetch request for ${window.startDate} to ${window.endDate}, page ${page}`,
    );

    return response.data;
  }

  private async fetchAllTranscripts(
    baseUrl: string,
    token: string,
    botUserId: string,
    channelId: number,
  ): Promise<{ customFields: Record<string, unknown>; tags: string[]; messages: RawTranscriptMessage[] }> {
    const url = `${baseUrl.replace(/\/$/, '')}/${TRANSCRIPTS_ENDPOINT.replace(/^\//, '')}`;
    const allMessages: RawTranscriptMessage[] = [];
    let customFields: Record<string, unknown> = {};
    let tags: string[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await this.withRetry(
        () =>
          firstValueFrom(
            this.httpService.post<NetcoreTranscriptsResponse>(
              url,
              { botUserId, channelId },
              {
                headers: {
                  Authorization: token,
                  accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                params: { page, limit: 500 },
              },
            ),
          ),
        `Transcripts fetch for botUserId=${botUserId} page=${page}`,
      );

      const data = response.data;

      if (page === 1) {
        customFields = data.botUser?.customFields ?? {};
        tags = data.botUser?.tags ?? [];
        totalPages = data.paginationDetails?.pages ?? 1;
      }

      allMessages.push(...(data.transcripts ?? []));
      page += 1;
    } while (page <= totalPages);

    return { customFields, tags, messages: allMessages };
  }

  private async fetchTranscriptProfile(
    baseUrl: string,
    token: string,
    botUserId: string,
    channelId: number,
  ): Promise<{ customFields: Record<string, unknown>; tags: string[] }> {
    const url = `${baseUrl.replace(/\/$/, '')}/${TRANSCRIPTS_ENDPOINT.replace(/^\//, '')}`;

    const response = await this.withRetry(
      () =>
        firstValueFrom(
          this.httpService.post<NetcoreTranscriptsResponse>(
            url,
            { botUserId, channelId },
            {
              headers: {
                Authorization: token,
                accept: 'application/json',
                'Content-Type': 'application/json',
              },
              params: { page: 1, limit: 25 },
            },
          ),
        ),
      `Transcript profile fetch for botUserId=${botUserId}`,
    );

    return {
      customFields: response.data?.botUser?.customFields ?? {},
      tags: response.data?.botUser?.tags ?? [],
    };
  }

  private flattenMessage(msg: RawTranscriptMessage): Record<string, unknown> {
    const r = msg as Record<string, unknown>;
    const text = (r['text'] as Record<string, unknown> | undefined);
    const reply = (r['reply'] as Record<string, unknown> | undefined);
    const replyHeader = (reply?.['header'] as Record<string, unknown> | undefined);
    const replyActions = (reply?.['actions'] as Record<string, unknown> | undefined);
    const list = (r['list'] as Record<string, unknown> | undefined);
    const listHeader = (list?.['header'] as Record<string, unknown> | undefined);
    const listActions = (list?.['actions'] as Record<string, unknown> | undefined);
    const image = (r['image'] as Record<string, unknown> | undefined);
    const attachment = (r['attachment'] as Record<string, unknown> | undefined);
    const location = (r['location'] as Record<string, unknown> | undefined);
    const locationRequest = (r['locationRequest'] as Record<string, unknown> | undefined);
    const tag = (r['tag'] as Record<string, unknown> | undefined);
    const order = (r['order'] as Record<string, unknown> | undefined);
    const opm = (r['orderPaymentMessage'] as Record<string, unknown> | undefined);
    const opmAction = (opm?.['action'] as Record<string, unknown> | undefined);
    const ps = (r['paymentStatus'] as Record<string, unknown> | undefined);
    const wf = (r['whatsappFlow'] as Record<string, unknown> | undefined);
    const wfActionBtn = (wf?.['actionButton'] as Record<string, unknown> | undefined);
    const aiAgentCtx = (r['aiAgentClearContext'] as Record<string, unknown> | undefined);
    const callPerm = (r['callPermission'] as Record<string, unknown> | undefined);
    const msgDetails = (r['messageDetails'] as Record<string, unknown> | undefined);

    return {
      fromRaw: String(r['from'] ?? ''),
      isConfigMessage: Boolean(r['isConfigMessage']),
      isFromAgent: Boolean(r['isFromAgent']),
      isPreviewUser: Boolean(r['isPreviewUser']),
      isTemplateSentFromFlow: Boolean(r['isTemplateSentFromFlow']),

      // text
      textMessage: String(text?.['message'] ?? ''),

      // reply
      replyBody: String(reply?.['body'] ?? ''),
      replyHeaderText: String(replyHeader?.['text'] ?? ''),
      replyHeaderUrl: String(replyHeader?.['url'] ?? ''),
      replyActions: replyActions ?? null,

      // list
      listBody: String(list?.['body'] ?? ''),
      listHeaderText: String(listHeader?.['text'] ?? ''),
      listActions: listActions ?? null,

      // image
      imageUrl: String(image?.['url'] ?? ''),
      imageCaption: String(r['caption'] ?? ''),

      // attachment
      attachmentUrl: String(attachment?.['contentUrl'] ?? ''),
      attachmentContentType: String(attachment?.['contentType'] ?? ''),
      attachmentIsVoice: Boolean(attachment?.['voice']),

      // location
      locationLatitude: String(location?.['latitude'] ?? ''),
      locationLongitude: String(location?.['longitude'] ?? ''),
      locationLabel: String(location?.['label'] ?? ''),
      locationAddress: String(location?.['address'] ?? ''),

      // locationRequest
      locationRequestBody: String(locationRequest?.['body'] ?? ''),

      // tag
      tagId: String(tag?.['tagId'] ?? ''),
      tagName: String(tag?.['tagName'] ?? ''),
      tagType: String(tag?.['tagType'] ?? ''),
      tagAction: String(tag?.['action'] ?? ''),
      tagFlowId: String(tag?.['flowId'] ?? ''),
      tagFlowName: String(tag?.['flowName'] ?? ''),

      // order
      orderCatalogId: String(order?.['catalogId'] ?? ''),
      orderItems: Array.isArray(order?.['items']) ? order!['items'] as Record<string, unknown>[] : [],

      // orderPaymentMessage
      orderPaymentBody: String(opm?.['body'] ?? ''),
      orderPaymentReferenceId: String(opmAction?.['referenceId'] ?? ''),
      orderPaymentStatus: String(opmAction?.['orderStatus'] ?? ''),
      orderPaymentAmount: (opmAction?.['totalAmount'] as Record<string, unknown>) ?? null,

      // paymentStatus
      paymentStatusReferenceId: String(ps?.['referenceId'] ?? ''),
      paymentStatusValue: String(ps?.['status'] ?? ''),

      // whatsappFlow
      whatsappFlowBody: String(wf?.['body'] ?? ''),
      whatsappFlowId: String(wf?.['whatsappFlowId'] ?? ''),
      whatsappFlowName: String(wf?.['whatsappFlowName'] ?? ''),
      whatsappFlowActionButtonText: String(wfActionBtn?.['text'] ?? ''),

      // aiAction
      aiActions: Array.isArray(r['aiAction']) ? r['aiAction'] as Record<string, unknown>[] : [],

      // aiAgentClearContext
      aiAgentFlowId: String(aiAgentCtx?.['flowId'] ?? ''),
      aiAgentFlowName: String(aiAgentCtx?.['flowName'] ?? ''),

      // callPermissionReply
      callPermissionStatus: String(callPerm?.['status'] ?? ''),

      // messageDetails
      messageSource: String(msgDetails?.['source'] ?? ''),
      messageSourceType: String(msgDetails?.['sourceType'] ?? ''),
    };
  }

  private channelNameToId(channelName: string): number {
    const name = channelName?.toLowerCase();
    return CHANNEL_IDS[name as keyof typeof CHANNEL_IDS] ?? CHANNEL_IDS.whatsapp;
  }

  async syncUsersFromDateRange(
    options: SyncUsersOptions = {},
  ): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>('NETCORE_API_BASE_URL');

    if (!baseUrl) {
      throw new Error('Missing NETCORE_API_BASE_URL');
    }

    const token = await this.getAccessToken(baseUrl);

    const startDate = new Date(SYNC_START_DATE);
    const endDate = new Date();
    const windows = this.buildDateWindows(startDate, endDate);
    const maxUsers =
      options.maxUsers && options.maxUsers > 0
        ? options.maxUsers
        : DEFAULT_MAX_USERS;
    const includeUsers = options.includeUsers ?? true;
    const windowsToFetch =
      options.maxWindows && options.maxWindows > 0
        ? windows.slice(0, options.maxWindows)
        : windows;
    const windowResults: Array<
      DateWindow & { pagesFetched: number; total?: number; usersFetched: number }
    > = [];
    let totalUsersFetched = 0;
    const users: unknown[] = [];

    for (const window of windowsToFetch) {
      let page = 1;
      let pagesFetched = 0;
      let total: number | undefined;
      let usersFetched = 0;

      while (true) {
        const remainingUsers = maxUsers - totalUsersFetched;

        if (remainingUsers <= 0) {
          break;
        }

        const pageLimit = Math.max(
          25,
          Math.min(USERS_PAGE_LIMIT, remainingUsers),
        );
        const pageResult = await this.fetchUsersPage(
          baseUrl,
          token,
          window,
          page,
          pageLimit,
        );
        const pageUsers = Array.isArray(pageResult.users)
          ? pageResult.users.slice(0, remainingUsers)
          : [];

        totalUsersFetched += pageUsers.length;
        usersFetched += pageUsers.length;
        if (includeUsers) {
          users.push(...pageUsers);
        }
        pagesFetched += 1;
        total = pageResult.total;

        const hasNextPage =
          Boolean(pageResult.hasNextPage) ||
          (typeof pageResult.pages === 'number' && page < pageResult.pages);

        if (!hasNextPage || totalUsersFetched >= maxUsers) {
          break;
        }

        page += 1;
      }

      windowResults.push({ ...window, pagesFetched, total, usersFetched });

      if (totalUsersFetched >= maxUsers) {
        break;
      }
    }

    const result: Record<string, unknown> = {
      requestedRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      sourceUrl: `${baseUrl.replace(/\/$/, '')}/${USERS_ENDPOINT.replace(/^\//, '')}`,
      channelIds: USER_CHANNEL_IDS,
      windowsPlanned: windows.length,
      windowsFetched: windowResults.length,
      windows: windowResults,
      totalUsersFetched,
      maxUsers,
    };

    if (includeUsers) {
      result.users = users;
    }

    return result;
  }

  async syncAndStoreUsers(): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>('NETCORE_API_BASE_URL');

    if (!baseUrl) {
      throw new Error('Missing NETCORE_API_BASE_URL');
    }

    const token = await this.getAccessToken(baseUrl);

    const startDate = new Date(SYNC_START_DATE);
    const endDate = new Date();
    const [firstWindow] = this.buildDateWindows(startDate, endDate);

    if (!firstWindow) {
      return { message: 'No date windows to process', customersSaved: 0 };
    }

    const allUsers: unknown[] = [];
    let totalFetched = 0;

    for (let page = 1; page <= MAX_PAGES_FOR_SYNC; page += 1) {
      const pageResult = await this.fetchUsersPage(
        baseUrl,
        token,
        firstWindow,
        page,
        USERS_PAGE_LIMIT,
      );

      const pageUsers = Array.isArray(pageResult.users) ? pageResult.users : [];
      allUsers.push(...pageUsers);
      totalFetched += pageUsers.length;

      this.logger.log(
        `Fetched page ${page}/${MAX_PAGES_FOR_SYNC}: ${pageUsers.length} users (total so far: ${totalFetched})`,
      );

      const hasNextPage =
        Boolean(pageResult.hasNextPage) ||
        (typeof pageResult.pages === 'number' && page < pageResult.pages);

      if (!hasNextPage) {
        this.logger.log(`No more pages after page ${page}`);
        break;
      }
    }

    this.logger.log(`Enriching ${allUsers.length} users with customFields + tags from transcripts...`);

    const enrichedUsers = await Promise.all(
      (allUsers as Array<Record<string, unknown>>).map(async (user) => {
        const botUserId = user.botUserId as string | undefined;
        const channelId = this.channelNameToId(user.channelName as string);

        if (!botUserId) return user;

        try {
          const { customFields, tags } = await this.fetchTranscriptProfile(baseUrl, token, botUserId, channelId);
          return { ...user, customFields, tags };
        } catch {
          this.logger.warn(`Could not fetch transcript profile for botUserId=${botUserId}`);
          return { ...user, customFields: {}, tags: [] };
        }
      }),
    );

    const customersSaved = await this.databaseService.upsertCustomers(enrichedUsers);

    return {
      window: firstWindow,
      pagesFetched: Math.min(MAX_PAGES_FOR_SYNC, Math.ceil(totalFetched / USERS_PAGE_LIMIT) || 1),
      totalUsersFetched: totalFetched,
      customersSaved,
    };
  }

  async syncAndStoreMessages(): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>('NETCORE_API_BASE_URL');
    if (!baseUrl) throw new Error('Missing NETCORE_API_BASE_URL');

    const token = await this.getAccessToken(baseUrl);

    // Load all stored customers from DB
    const customers = await this.databaseService.getCustomers(10000, 0);
    this.logger.log(`Syncing messages + enriching ${customers.length} customers...`);

    let totalMessagesSaved = 0;
    let customersEnriched = 0;
    let customersFailed = 0;

    for (const customer of customers) {
      const botUserId = customer.botUserId;
      const channelId = this.channelNameToId(customer.channelName);

      if (!botUserId) continue;

      try {
        const { customFields, tags, messages } = await this.fetchAllTranscripts(
          baseUrl, token, botUserId, channelId,
        );

        // Update customer with fresh customFields + tags
        await this.databaseService.upsertCustomers([{
          userId: customer.userId,
          botUserId: customer.botUserId,
          name: customer.name,
          channelName: customer.channelName,
          createdDate: customer.createdDate?.toISOString(),
          'first interacted date': customer.firstInteractedDate?.toISOString(),
          'last interacted date': customer.lastInteractedDate?.toISOString(),
          customFields,
          tags,
        }]);
        customersEnriched += 1;

        // Delete old messages for this user and re-insert fresh
        await this.databaseService.deleteMessagesByUserId(customer.userId);

        const messageDocs = messages.map((msg) => ({
          customerId: customer._id,
          userId: customer.userId,
          sessionId: botUserId,
          from: (msg.from?.toLowerCase() === 'user' ? 'user' : 'bot') as 'user' | 'bot',
          type: msg.type ?? 'text',
          channelName: customer.channelName,
          sentAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
          ...this.flattenMessage(msg),
          rawMessage: msg as Record<string, unknown>,
        }));

        const saved = await this.databaseService.bulkSaveMessages(messageDocs);
        totalMessagesSaved += saved;

        this.logger.log(
          `[${customersEnriched}/${customers.length}] ${botUserId}: ${messages.length} messages saved`,
        );
      } catch (err) {
        customersFailed += 1;
        this.logger.warn(`Failed for botUserId=${botUserId}: ${this.formatError(err)}`);
      }
    }

    return {
      customersProcessed: customers.length,
      customersEnriched,
      customersFailed,
      totalMessagesSaved,
    };
  }
}
