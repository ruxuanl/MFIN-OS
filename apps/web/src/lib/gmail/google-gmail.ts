import "server-only";

export type GmailHeader = { name?: string; value?: string };
export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};
export type GmailMessageResource = {
  id?: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};
export type GmailProfile = { emailAddress?: string; historyId?: string };
export type GmailMessagePage = {
  messages?: Array<{ id?: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};
export type GmailHistoryPage = {
  history?: Array<{ id?: string; messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }> }>;
  historyId?: string;
  nextPageToken?: string;
};

export class GmailProviderError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}
export class GoogleGmailClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly beforeRequest: () => Promise<void> = async () => undefined
  ) {}

  private async request<T>(path: string) {
    await this.beforeRequest();
    const response = await this.fetcher(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
      headers: { authorization: `Bearer ${this.accessToken}`, accept: "application/json" },
      cache: "no-store"
      ,signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new GmailProviderError(response.status, `gmail_api_${response.status}`);
    return await response.json() as T;
  }

  profile() {
    return this.request<GmailProfile>("/profile");
  }

  listMessages(query: string, maxResults: number, pageToken?: string) {
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults), includeSpamTrash: "false" });
    if (pageToken) params.set("pageToken", pageToken);
    return this.request<GmailMessagePage>(`/messages?${params}`);
  }

  getMessage(messageId: string) {
    return this.request<GmailMessageResource>(`/messages/${encodeURIComponent(messageId)}?format=full`);
  }

  listHistory(startHistoryId: string, pageToken?: string) {
    const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    return this.request<GmailHistoryPage>(`/history?${params}`);
  }

  async getAttachment(messageId: string, attachmentId: string) {
    return this.request<{ data?: string; size?: number }>(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
    );
  }
}
