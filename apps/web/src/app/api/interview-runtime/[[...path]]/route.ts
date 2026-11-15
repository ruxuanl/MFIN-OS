import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { callInterviewRuntime, isInterviewLocalEnabled, type InterviewCatalog } from "@/lib/interview/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const base = "/api/interview-runtime";
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const url = new URL(request.url);
  // Next dev can normalize request.url to localhost when the browser uses 127.0.0.1.
  return origin === url.origin || origin === `${url.protocol}//${request.headers.get("host")}`;
}

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请重新登录" }, { status: 401 });
  if (!isInterviewLocalEnabled()) return Response.json({ error: "本地面试工作区尚未启用" }, { status: 503 });
  if (request.method === "POST" && (!sameOrigin(request) || request.headers.get("x-local-app") !== "1")) {
    return Response.json({ error: "同源验证失败" }, { status: 403 });
  }
  const segments = (await context.params).path || [];
  if (segments.some(p => p === ".." || !/^[a-zA-Z0-9_.:-]+$/.test(p))) return Response.json({ error: "无效路径" }, { status: 400 });
  const path = "/" + segments.join("/");
  try {
    const client = await createClient();
    const lock = user.isMock ? { data: { is_locked: false }, error: null } : await client.from("privacy_locks").select("is_locked").eq("user_id", user.id).maybeSingle();
    if (lock.error) throw lock.error;
    if (lock.data?.is_locked) return Response.json({ error: "主应用隐私锁已开启，请先到状态中心解锁" }, { status: 423 });
    let catalog: InterviewCatalog = { mode: "host", jobs: [], resumes: [] };
    if (!user.isMock) {
      const [jobs, documents, versions] = await Promise.all([
        client.from("opportunity_candidates").select("id,company,role_title,department,location,source_summary,track,decision_status").eq("user_id", user.id).eq("track", "internship").eq("decision_status", "candidate"),
        client.from("resume_documents").select("id,label,document_kind").eq("user_id", user.id).is("archived_at", null),
        client.from("resume_versions").select("id,document_id,version_number,original_filename").eq("user_id", user.id).order("version_number", { ascending: false })
      ]);
      if (jobs.error || documents.error || versions.error) throw new Error("catalog_unavailable");
      catalog = { mode: "host", jobs: jobs.data || [], resumes: (versions.data || []).flatMap(v => {
        const doc = documents.data?.find(d => d.id === v.document_id);
        return doc ? [{ ...v, label: doc.label, document_kind: doc.document_kind }] : [];
      }) };
    }
    let body: Buffer | undefined;
    if (request.method === "POST") {
      const chunks: Uint8Array[] = []; let size = 0;
      if (request.body) for await (const chunk of request.body) { size += chunk.length; if (size > 11 * 1024 * 1024) return Response.json({ error: "文件过大" }, { status: 413 }); chunks.push(chunk); }
      body = Buffer.concat(chunks);
      let command: { op?: string } | null = null;
      if (path === "/api") {
        try { command = JSON.parse(body.toString("utf8")) as { op?: string }; }
        catch { return Response.json({ error: "无效 JSON" }, { status: 400 }); }
      }
      if (!user.isMock && (path === "/api/upload" || command?.op === "import")) {
        const permission = await client.rpc("get_my_permission_decision", { capability_key: "files.upload" });
        if (permission.error) return Response.json({ error: "暂时无法核验上传权限，请稍后重试" }, { status: 503 });
        const decision = permission.data?.[0];
        if (!decision?.allowed) return Response.json({
          error: decision?.reason === "grant_expired"
            ? "文件上传的临时授权已到期，请到状态中心重新开启“文件上传”，再选择文件重试。"
            : "文件上传尚未获准，请到状态中心检查“文件上传”及其依赖权限，再选择文件重试。",
          code: "UPLOAD_PERMISSION_REQUIRED"
        }, { status: 403 });
      }
    }
    if (path === "/bootstrap.js") return new Response(`window.INTERVIEW_BASE=${JSON.stringify(base)};`, { headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" } });
    const result = await callInterviewRuntime(user.id, catalog, path, request.method, body, request.headers.get("content-type") || undefined);
    const headers = new Headers({ "Content-Type": String(result.headers["content-type"] || "application/octet-stream"), "Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN", "Permissions-Policy": "camera=(), microphone=(self), geolocation=()", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; frame-ancestors 'self'" });
    if (result.headers["content-disposition"]) headers.set("Content-Disposition", String(result.headers["content-disposition"]));
    if (headers.get("Content-Type")?.startsWith("text/html")) {
      const html = result.body.toString("utf8").replace('<script src="/voice.js"', `<script src="${base}/bootstrap.js" defer></script><script src="/voice.js"`).replaceAll('src="/', `src="${base}/`).replaceAll('href="/style.css"', `href="${base}/style.css"`).replaceAll(`${base}${base}/bootstrap.js`, `${base}/bootstrap.js`);
      return new Response(html, { status: result.status, headers });
    }
    return new Response(new Uint8Array(result.body), { status: result.status, headers });
  } catch {
    return Response.json({ error: "面试工作区暂时无法读取，请检查本地运行配置" }, { status: 503 });
  }
}
export { handle as GET, handle as POST };
