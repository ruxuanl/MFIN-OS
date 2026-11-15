import { getCurrentUser } from "@/lib/auth/session";
import { getMailbox } from "@/lib/gmail/insight-data";
import { isMailCategory, isMailPriority } from "@/lib/gmail/insight-model";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "登录已过期，请刷新页面后重新登录。" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const category = params.get("category");
  const priority = params.get("priority");
  const page = Number(params.get("page") ?? "1");
  if ((category !== null && !isMailCategory(category)) || (priority !== null && !isMailPriority(priority)) || !Number.isInteger(page) || page < 1 || page > 100000) {
    return Response.json({ error: "邮件筛选无效，请刷新页面重试。" }, { status: 400, headers });
  }
  try {
    const data = await getMailbox(user, category ?? undefined, priority ?? undefined, page);
    return Response.json({ messages: data.messages, total: data.total }, { headers });
  } catch {
    return Response.json({ error: "暂时无法加载邮件，请重试。" }, { status: 503, headers });
  }
}
