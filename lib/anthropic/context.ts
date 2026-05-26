import "server-only";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";

export const MAX_CONTEXT_CHARS_PER_FILE = 50_000;

export interface ContextFileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  storagePath: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Downloads a file from Firebase Storage and extracts its text content.
 * Returns the extracted text truncated to MAX_CONTEXT_CHARS_PER_FILE.
 *
 * Returns a clear placeholder rather than throwing when:
 *   - storage is bypassed in dev (storagePath is empty)
 *   - the file is missing in Storage
 *   - the file type is binary and unsupported (e.g. images)
 */
export async function extractTextFromFile(
  storagePath: string,
  fileType: string,
  fileName?: string
): Promise<string> {
  if (!storagePath) {
    return placeholder(
      "Storage bypass is active in dev — the actual bytes were not uploaded. Only metadata is available."
    );
  }

  let buffer: Buffer;
  try {
    const bucket = getStorage(getFirebaseAdminApp()).bucket();
    const [bytes] = await bucket.file(storagePath).download();
    buffer = bytes;
  } catch (e) {
    const message = e instanceof Error ? e.message : "download failed";
    return placeholder(`Could not download from Storage: ${message}`);
  }

  const ext = (fileName ?? storagePath).split(".").pop()?.toLowerCase() ?? "";
  const mime = fileType.toLowerCase();

  try {
    let text: string;

    if (mime === "application/pdf" || ext === "pdf") {
      text = await extractPdf(buffer);
    } else if (
      mime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel" ||
      ext === "xlsx" ||
      ext === "xls" ||
      mime === "text/csv" ||
      ext === "csv"
    ) {
      text = await extractSpreadsheet(buffer, ext === "csv" || mime === "text/csv");
    } else if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      text = await extractDocx(buffer);
    } else if (
      mime.startsWith("text/") ||
      mime === "application/json" ||
      ext === "txt" ||
      ext === "md" ||
      ext === "json"
    ) {
      text = buffer.toString("utf8");
    } else {
      return placeholder(
        `File type "${fileType || ext || "unknown"}" is not supported for text extraction.`
      );
    }

    return truncate(text.trim(), MAX_CONTEXT_CHARS_PER_FILE);
  } catch (e) {
    const message = e instanceof Error ? e.message : "extraction failed";
    return placeholder(`Could not extract text: ${message}`);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2: dynamic import keeps the SDK out of bundling on cold paths.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text ?? "";
}

async function extractSpreadsheet(
  buffer: Buffer,
  isCsv: boolean
): Promise<string> {
  if (isCsv) return buffer.toString("utf8");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`# Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join("\n\n");
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

function placeholder(reason: string): string {
  return `[content unavailable — ${reason}]`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return (
    text.slice(0, max) +
    `\n\n[truncated — original length was ${text.length} characters, showing first ${max}]`
  );
}

/**
 * Formats a list of files into a single context string with clear delimiters.
 * Extracts each file in parallel.
 */
export async function buildContextString(
  files: ContextFileMetadata[]
): Promise<string> {
  if (files.length === 0) return "";
  const sections = await Promise.all(
    files.map(async (f) => {
      const text = await extractTextFromFile(f.storagePath, f.type, f.name);
      return `--- File: ${f.name} ---\n${text}`;
    })
  );
  return sections.join("\n\n");
}

/**
 * Prepends the context as a user message at the very start of the conversation,
 * followed by a short assistant acknowledgement. The assistant ack is required
 * because Anthropic expects alternating roles starting with `user`.
 *
 * The context messages are NOT persisted — call this at request time so the
 * stored history stays clean and you can change attached files between turns.
 */
export function attachContextToMessages(
  messages: AnthropicMessage[],
  contextString: string
): AnthropicMessage[] {
  if (!contextString) return messages;
  return [
    {
      role: "user",
      content:
        "The following files have been attached as context for this conversation. " +
        "Use them to inform your responses. Do not repeat their contents back unless asked.\n\n" +
        contextString,
    },
    {
      role: "assistant",
      content:
        "Understood. I have the attached files and will reference them as needed.",
    },
    ...messages,
  ];
}
