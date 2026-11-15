import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: null as null | { id: string; isMock: boolean }, enabled: true, locked: false, upload: true, reason: "grant_inactive", permissionError: false, engine: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mock.user }));
vi.mock("@/lib/interview/runtime", () => ({ isInterviewLocalEnabled: () => mock.enabled, callInterviewRuntime: mock.engine }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.client }));
import { GET, POST } from "./route";
const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
describe("hosted interview boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mock.user = { id: "owner-a", isMock: false }; mock.enabled = true; mock.locked = false; mock.upload = true; mock.reason = "grant_inactive"; mock.permissionError = false;
    mock.client.mockResolvedValue({ from: (table: string) => {
      const value = { data: table === "privacy_locks" ? { is_locked: mock.locked } : [], error: null };
      const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, maybeSingle: async () => value, then: (done: (v: typeof value) => unknown) => Promise.resolve(value).then(done) };
      return chain;
    }, rpc: async () => ({ data: [{ allowed: mock.upload, reason: mock.reason }], error: mock.permissionError ? new Error("unavailable") : null }) });
    mock.engine.mockResolvedValue({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from('<link href="/style.css"><script src="/voice.js" defer></script><script src="/app.js" defer></script>') });
  });
  it("requires the main application session", async () => {
    mock.user = null;
    expect((await GET(new Request("http://localhost:3000/api/interview-runtime"), context())).status).toBe(401);
    expect(mock.engine).not.toHaveBeenCalled();
  });
  it("fails closed when local hosting is disabled or privacy locked", async () => {
    mock.enabled = false;
    expect((await GET(new Request("http://localhost:3000/api/interview-runtime"), context())).status).toBe(503);
    mock.enabled = true; mock.locked = true;
    expect((await GET(new Request("http://localhost:3000/api/interview-runtime"), context())).status).toBe(423);
    expect(mock.engine).not.toHaveBeenCalled();
  });
  it("rejects a forged origin and malformed commands before engine writes", async () => {
    expect((await POST(new Request("http://localhost:3000/api/interview-runtime/api", { method: "POST", headers: { origin: "https://bad.invalid", "x-local-app": "1" }, body: "{}" }), context(["api"]))).status).toBe(403);
    expect((await POST(new Request("http://localhost:3000/api/interview-runtime/api", { method: "POST", headers: { origin: "http://localhost:3000", "x-local-app": "1" }, body: "invalid" }), context(["api"]))).status).toBe(400);
    expect(mock.engine).not.toHaveBeenCalled();
  });
  it("requires the existing upload capability", async () => {
    mock.upload = false;
    expect((await POST(new Request("http://localhost:3000/api/interview-runtime/api/upload", { method: "POST", headers: { origin: "http://localhost:3000", "x-local-app": "1" }, body: "synthetic" }), context(["api", "upload"]))).status).toBe(403);
    expect(mock.engine).not.toHaveBeenCalled();
  });
  it("accepts an actual same-host IPv4 origin when Next normalizes its URL", async () => {
    const response = await POST(new Request("http://localhost:3000/api/interview-runtime/api", { method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "x-local-app": "1" }, body: JSON.stringify({ op: "qa", project: "citics", question: "synthetic" }) }), context(["api"]));
    expect(response.status).toBe(200);
    expect(mock.engine).toHaveBeenCalled();
  });
  it("explains an expired upload grant without forwarding a file or renewing the grant", async () => {
    mock.upload = false; mock.reason = "grant_expired";
    const response = await POST(new Request("http://localhost:3000/api/interview-runtime/api/upload", { method: "POST", headers: { origin: "http://localhost:3000", "x-local-app": "1" }, body: "synthetic" }), context(["api", "upload"]));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "UPLOAD_PERMISSION_REQUIRED", error: expect.stringContaining("临时授权已到期") });
    expect(mock.engine).not.toHaveBeenCalled();
  });
  it("distinguishes an unavailable permission check from a denied grant", async () => {
    mock.permissionError = true;
    const response = await POST(new Request("http://localhost:3000/api/interview-runtime/api/upload", { method: "POST", headers: { origin: "http://localhost:3000", "x-local-app": "1" }, body: "synthetic" }), context(["api", "upload"]));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("无法核验");
    expect(mock.engine).not.toHaveBeenCalled();
  });
  it("preserves multipart bytes and boundary for an authorized upload", async () => {
    const form = new FormData(); form.set("project", "citics"); form.set("file", new Blob(["synthetic upload"]), "notes.txt");
    const request = new Request("http://localhost:3000/api/interview-runtime/api/upload", { method: "POST", headers: { origin: "http://localhost:3000", "x-local-app": "1" }, body: form });
    const bytes = Buffer.from(await request.clone().arrayBuffer());
    expect((await POST(request, context(["api", "upload"]))).status).toBe(200);
    expect(mock.engine).toHaveBeenCalledWith("owner-a", expect.any(Object), "/api/upload", "POST", bytes, request.headers.get("content-type"));
  });
  it("hosts assets on the current origin and binds the authenticated owner", async () => {
    const response = await GET(new Request("http://localhost:3000/api/interview-runtime/knowledge"), context(["knowledge"]));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(html).toContain('src="/api/interview-runtime/bootstrap.js"');
    expect(html).toContain('src="/api/interview-runtime/app.js"');
    expect(html).not.toContain("3210");
    expect(mock.engine).toHaveBeenCalledWith("owner-a", { mode: "host", jobs: [], resumes: [] }, "/knowledge", "GET", undefined, undefined);
  });
});
