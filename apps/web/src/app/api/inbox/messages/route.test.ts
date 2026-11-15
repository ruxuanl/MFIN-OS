import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), mailbox: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/gmail/insight-data", () => ({ getMailbox: mocks.mailbox }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner", isMock: false });
  mocks.mailbox.mockResolvedValue({ messages: [{ id: "mail-31" }], total: 61, counts: [], unfinished: 0, queued: 0 });
});

it("rejects an expired session without reading mail", async () => {
  mocks.user.mockResolvedValue(null);
  const result = await GET(new Request("http://localhost/api/inbox/messages?page=2"));
  expect(result.status).toBe(401);
  expect(mocks.mailbox).not.toHaveBeenCalled();
});

it("reads the next page for the session owner and preserves both filters", async () => {
  const result = await GET(new Request("http://localhost/api/inbox/messages?page=2&category=job&priority=important&userId=other"));
  expect(mocks.mailbox).toHaveBeenCalledWith({ id: "owner", isMock: false }, "job", "important", 2);
  expect(await result.json()).toEqual({ messages: [{ id: "mail-31" }], total: 61 });
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});

it("supports the all-mail stream without a category or priority", async () => {
  await GET(new Request("http://localhost/api/inbox/messages?page=3"));
  expect(mocks.mailbox).toHaveBeenCalledWith({ id: "owner", isMock: false }, undefined, undefined, 3);
});

it.each(["page=0", "page=1.5", "page=nope", "page=100001", "category=invalid", "priority=invalid"])("rejects invalid pagination and filters: %s", async query => {
  expect((await GET(new Request(`http://localhost/api/inbox/messages?${query}`))).status).toBe(400);
  expect(mocks.mailbox).not.toHaveBeenCalled();
});

it("returns a retryable failure without exposing database details", async () => {
  mocks.mailbox.mockRejectedValue(new Error("private database failure"));
  const result = await GET(new Request("http://localhost/api/inbox/messages?page=2"));
  expect(result.status).toBe(503);
  expect(JSON.stringify(await result.json())).not.toContain("private database");
});
