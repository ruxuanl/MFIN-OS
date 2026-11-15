import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),fresh:vi.fn(),read:vi.fn(),root:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({getCurrentUser:m.user,hasFreshReauthentication:m.fresh}));
vi.mock("node:fs/promises",()=>({readFile:m.read}));
vi.mock("@/lib/reports/archive",()=>({archiveRoot:m.root}));
import { GET } from "./route";
const id="11111111-1111-4111-8111-111111111111";
const call=(query="",reportId=id)=>GET(new Request(`http://localhost/api/reports/${reportId}/pdf${query}`),{params:Promise.resolve({id:reportId})});
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({id:"synthetic-owner",isMock:false});m.fresh.mockResolvedValue(false);m.root.mockReturnValue("/private/synthetic-owner");m.read.mockResolvedValue(Buffer.from("%PDF-synthetic"));});
describe("report source file",()=>{
 it("requires login even for inline viewing",async()=>{m.user.mockResolvedValue(null);expect((await call("?view=1")).status).toBe(401);expect(m.read).not.toHaveBeenCalled();});
 it("uses inline disposition for the signed-in owner's source PDF",async()=>{const r=await call("?view=1");expect(r.status).toBe(200);expect(r.headers.get("content-disposition")).toMatch(/^inline;/);expect(r.headers.get("cache-control")).toBe("private, no-store");expect(m.root).toHaveBeenCalledWith("synthetic-owner");expect(m.read.mock.calls[0][0]).toContain(id+".pdf");});
 it("retains recent identity verification for downloads",async()=>{expect((await call()).status).toBe(403);expect(m.read).not.toHaveBeenCalled();m.fresh.mockResolvedValue(true);const r=await call();expect(r.status).toBe(200);expect(r.headers.get("content-disposition")).toMatch(/^attachment;/);});
 it("rejects path traversal and handles missing files",async()=>{expect((await call("?view=1","..%2Fother-owner")).status).toBe(404);expect(m.read).not.toHaveBeenCalled();m.read.mockRejectedValue(new Error("ENOENT"));expect((await call("?view=1")).status).toBe(404);});
});
