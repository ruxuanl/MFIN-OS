import "server-only";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type InterviewCatalog = { mode: string; jobs: unknown[]; resumes: unknown[] };
type LocalRuntime = { server: Server; port: number; catalog: InterviewCatalog };
const state = globalThis as typeof globalThis & { interviewRuntimes?: Map<string, Promise<LocalRuntime>> };

export function isInterviewLocalEnabled() {
  return process.env.INTERVIEW_LOCAL_ENABLED === "true" && process.env.APP_ENV !== "production" && !process.env.VERCEL;
}

async function runtimeFor(ownerId: string, catalog: InterviewCatalog) {
  if (!isInterviewLocalEnabled() || !/^[a-zA-Z0-9-]+$/.test(ownerId)) throw new Error("interview_local_unavailable");
  const runtimes = state.interviewRuntimes ??= new Map();
  let promise = runtimes.get(ownerId);
  if (!promise) {
    promise = (async () => {
      const root = [resolve(process.cwd(), "experiments/interview-copilot"), resolve(process.cwd(), "../../experiments/interview-copilot")]
        .find(dir => existsSync(resolve(dir, "server.mjs")));
      if (!root) throw new Error("interview_engine_missing");
      const legacy = process.env.INTERVIEW_LOCAL_OWNER_ID === ownerId ? process.env.INTERVIEW_LOCAL_DATA_ROOT : undefined;
      const data = resolve(legacy || resolve(root, "runtime-data/owners", ownerId));
      await mkdir(data, { recursive: true });
      // The standalone module remains a local Node/Python engine, not a serverless dependency.
      const engineModule = await import(/* webpackIgnore: true */ pathToFileURL(resolve(root, "server.mjs")).href) as {
        createApp: (dir: URL, options: { catalog: InterviewCatalog; modelCache: URL }) => Promise<Server>;
      };
      const server = await engineModule.createApp(pathToFileURL(data + "/"), {
        catalog,
        modelCache: pathToFileURL(resolve(process.env.INTERVIEW_LOCAL_MODEL_ROOT || resolve(root, "runtime-data/models")) + "/")
      });
      await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
      server.unref();
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("interview_engine_unavailable");
      return { server, port: address.port, catalog };
    })();
    runtimes.set(ownerId, promise);
    promise.catch(() => runtimes.delete(ownerId));
  }
  const engine = await promise;
  Object.assign(engine.catalog, catalog);
  return engine;
}

export async function callInterviewRuntime(ownerId: string, catalog: InterviewCatalog, path: string, method: string, body?: Buffer, contentType?: string) {
  const engine = await runtimeFor(ownerId, catalog);
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((done, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port: engine.port, path, method, headers: {
      host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210", "x-local-app": "1", ...(contentType ? { "content-type": contentType } : {})
    } }, response => {
      const chunks: Buffer[] = []; let length = 0;
      response.on("data", (chunk: Buffer) => { length += chunk.length; if (length > 32 * 1024 * 1024) request.destroy(new Error("interview_response_too_large")); else chunks.push(chunk); });
      response.on("end", () => done({ status: response.statusCode || 500, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.setTimeout(65000, () => request.destroy(new Error("interview_timeout")));
    request.on("error", reject);
    request.end(body);
  });
}
