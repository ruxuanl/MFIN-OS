import "server-only";

import { createHash } from "node:crypto";

import { extractText, getDocumentProxy } from "unpdf";
import yauzl, { type Entry, type ZipFile } from "yauzl";

export const RESUME_FILE_LIMIT = 10 * 1024 * 1024;
export const RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
] as const;

export type ResumeMimeType = (typeof RESUME_MIME_TYPES)[number];

export type ExtractedResumeFile = {
  bytes: Buffer;
  contentSha256: string;
  mimeType: ResumeMimeType;
  extension: "pdf" | "docx";
  sizeBytes: number;
  pageCount: number | null;
  extractedCharacterCount: number;
  extractedText: string;
};

export class ResumeFileValidationError extends Error {
  constructor(public readonly code:
    | "empty"
    | "too_large"
    | "unsupported_type"
    | "type_mismatch"
    | "encrypted"
    | "too_complex"
    | "no_text"
    | "extract_failed"
  ) {
    super(`resume_file_${code}`);
  }
}

const MAX_PDF_PAGES = 80;
const MAX_ZIP_ENTRIES = 1_000;
const MAX_DOCUMENT_XML_BYTES = 6 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 100_000;
const EXTRACTION_TIMEOUT_MILLISECONDS = 12_000;

function withTimeout<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ResumeFileValidationError("too_complex")),
      EXTRACTION_TIMEOUT_MILLISECONDS
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); }
    );
  });
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function validateResumeFileBytes(bytes: Uint8Array, declaredMimeType: string) {
  if (bytes.byteLength === 0) throw new ResumeFileValidationError("empty");
  if (bytes.byteLength > RESUME_FILE_LIMIT) throw new ResumeFileValidationError("too_large");
  const mimeType = declaredMimeType.toLowerCase() as ResumeMimeType;
  if (!RESUME_MIME_TYPES.includes(mimeType)) throw new ResumeFileValidationError("unsupported_type");
  const isPdf = startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  const isZip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if ((mimeType === "application/pdf" && !isPdf)
    || (mimeType !== "application/pdf" && !isZip)) {
    throw new ResumeFileValidationError("type_mismatch");
  }
  return mimeType;
}

function safeZipName(name: string) {
  return !name.startsWith("/") && !/^[a-z]:/iu.test(name)
    && !name.split("/").includes("..") && !name.includes("\\");
}

function openZip(bytes: Buffer) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(bytes, {
      lazyEntries: true,
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true
    }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error("zip_open_failed"));
      else resolve(zipFile);
    });
  });
}

function readEntry(zipFile: ZipFile, entry: Entry) {
  return new Promise<string>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) { reject(error ?? new Error("zip_entry_unavailable")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_DOCUMENT_XML_BYTES) {
          stream.destroy(new ResumeFileValidationError("too_complex"));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  });
}

async function documentXml(bytes: Buffer) {
  const zipFile = await openZip(bytes);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let entryCount = 0;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error);
    };
    zipFile.on("error", fail);
    zipFile.on("entry", (entry: Entry) => {
      void (async () => {
        entryCount += 1;
        if (entryCount > MAX_ZIP_ENTRIES || !safeZipName(entry.fileName)) {
          throw new ResumeFileValidationError("too_complex");
        }
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
          throw new ResumeFileValidationError("encrypted");
        }
        if (entry.fileName !== "word/document.xml") { zipFile.readEntry(); return; }
        if (entry.uncompressedSize > MAX_DOCUMENT_XML_BYTES) {
          throw new ResumeFileValidationError("too_complex");
        }
        const xml = await readEntry(zipFile, entry);
        settled = true;
        zipFile.close();
        resolve(xml);
      })().catch(fail);
    });
    zipFile.on("end", () => {
      if (!settled) fail(new ResumeFileValidationError("type_mismatch"));
    });
    zipFile.readEntry();
  });
}

function decodeXml(value: string) {
  return value.replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'").replace(/&amp;/gu, "&");
}

function docxText(xml: string) {
  return decodeXml(xml
    .replace(/<w:tab\b[^>]*\/>/gu, "\t")
    .replace(/<w:br\b[^>]*\/>/gu, "\n")
    .replace(/<\/w:p>/gu, "\n")
    .replace(/<[^>]*>/gu, ""));
}

function normalizeText(value: string) {
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_EXTRACTED_CHARACTERS);
  if (normalized.length < 80) throw new ResumeFileValidationError("no_text");
  return normalized;
}

async function extractPdf(bytes: Buffer) {
  const document = await withTimeout(getDocumentProxy(Uint8Array.from(bytes), {
    maxImageSize: 16_777_216,
    stopAtErrors: true
  }));
  try {
    if (document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
      throw new ResumeFileValidationError("too_complex");
    }
    const result = await withTimeout(extractText(document, { mergePages: true }));
    return { text: result.text, pageCount: document.numPages };
  } finally {
    await document.cleanup();
  }
}

export async function extractResumeFile(file: File): Promise<ExtractedResumeFile> {
  if (file.size === 0) throw new ResumeFileValidationError("empty");
  if (file.size > RESUME_FILE_LIMIT) throw new ResumeFileValidationError("too_large");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = validateResumeFileBytes(bytes, file.type);
  try {
    const extracted = mimeType === "application/pdf"
      ? await extractPdf(bytes)
      : { text: docxText(await withTimeout(documentXml(bytes))), pageCount: null };
    const extractedText = normalizeText(extracted.text);
    return {
      bytes,
      contentSha256: createHash("sha256").update(bytes).digest("hex"),
      mimeType,
      extension: mimeType === "application/pdf" ? "pdf" : "docx",
      sizeBytes: bytes.byteLength,
      pageCount: extracted.pageCount,
      extractedCharacterCount: extractedText.length,
      extractedText
    };
  } catch (error) {
    if (error instanceof ResumeFileValidationError) throw error;
    throw new ResumeFileValidationError("extract_failed");
  }
}
