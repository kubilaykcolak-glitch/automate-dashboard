import "server-only";
import { utils as xlsxUtils, write as xlsxWrite } from "xlsx";
import PDFDocument from "pdfkit";

/**
 * Export file generation. Handles CSV, XLSX, and PDF — the three formats the
 * create_export tool can produce. All three return a Buffer + MIME type and
 * are wrapped into a data URL by the chat route so the browser can download
 * them inline (no Firebase Storage dependency in dev bypass mode).
 *
 * When Firebase Storage gets enabled, swap the data-URL path for uploadBytes
 * + getSignedUrl. The public API of this module stays the same.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf";

export interface GeneratedExport {
  filename: string;
  format: ExportFormat;
  size: number;
  /** data:<mime>;base64,<...> — browser-downloadable directly. */
  downloadUrl: string;
  /** Human-readable title shown in the download card. Falls back to filename. */
  title?: string;
}

/** Row shape accepted by CSV/XLSX generators. Keys become column headers. */
export type ExportRow = Record<string, string | number | boolean | null>;

/**
 * Hard upper bound on a single exported file. Data URLs over a few MB get
 * unwieldy in memory and the chat UI bubble. Real users producing larger
 * datasets should switch to Firebase Storage when it's enabled.
 */
const MAX_EXPORT_BYTES = 5 * 1024 * 1024; // 5 MB

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export interface ExportRequest {
  format: ExportFormat;
  filename: string;
  title?: string;
  /** Required for csv + xlsx. */
  rows?: ExportRow[];
  /** Required for pdf. Plain markdown — basic rendering only. */
  markdown?: string;
}

/**
 * Main entry point used by the chat route's create_export tool branch.
 * Validates input, dispatches by format, wraps into a data URL.
 * Throws an Error with a user-readable message on bad input — the caller
 * surfaces it back to the model as an is_error tool_result.
 */
export async function buildExport(
  req: ExportRequest
): Promise<GeneratedExport> {
  const format = req.format;
  const filename = sanitizeFilename(req.filename, format);

  let buffer: Buffer;
  if (format === "csv") {
    if (!req.rows || req.rows.length === 0) {
      throw new Error("CSV export requires a non-empty `rows` array.");
    }
    buffer = generateCsv(req.rows);
  } else if (format === "xlsx") {
    if (!req.rows || req.rows.length === 0) {
      throw new Error("XLSX export requires a non-empty `rows` array.");
    }
    buffer = generateXlsx(req.rows, req.title ?? "Sheet1");
  } else if (format === "pdf") {
    if (!req.markdown || req.markdown.trim().length === 0) {
      throw new Error("PDF export requires a non-empty `markdown` body.");
    }
    buffer = await generatePdf(req.markdown, req.title ?? filename);
  } else {
    throw new Error(`Unsupported export format "${format}".`);
  }

  if (buffer.length > MAX_EXPORT_BYTES) {
    throw new Error(
      `Generated file is too large (${buffer.length} bytes, max ${MAX_EXPORT_BYTES}). Split the data into multiple smaller exports.`
    );
  }

  const mime = MIME_BY_FORMAT[format];
  const downloadUrl = `data:${mime};base64,${buffer.toString("base64")}`;

  return {
    filename,
    format,
    size: buffer.length,
    downloadUrl,
    title: req.title,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function generateCsv(rows: ExportRow[]): Buffer {
  const headers = collectHeaders(rows);
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(","));
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => escapeCsvCell(formatCellValue(row[h])))
        .join(",")
    );
  }
  // Prepend a BOM so Excel opens UTF-8 correctly without prompting for encoding.
  return Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(lines.join("\r\n"), "utf8"),
  ]);
}

function escapeCsvCell(cell: string): string {
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n") || cell.includes("\r")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function generateXlsx(rows: ExportRow[], sheetName: string): Buffer {
  const headers = collectHeaders(rows);
  const aoa: (string | number | boolean | null)[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map((h) => (row[h] === undefined ? null : row[h])));
  }
  const sheet = xlsxUtils.aoa_to_sheet(aoa);
  // Set sensible column widths based on header length.
  sheet["!cols"] = headers.map((h) => ({
    wch: Math.min(50, Math.max(10, h.length + 4)),
  }));
  const book = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(book, sheet, truncateSheetName(sheetName));
  const out = xlsxWrite(book, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

function truncateSheetName(name: string): string {
  // Excel sheet names are limited to 31 chars and can't contain : \ / ? * [ ]
  return name.replace(/[:\\/?*\[\]]/g, "_").slice(0, 31) || "Sheet1";
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Render markdown into a PDF using pdfkit. Intentionally simple — handles:
 *   - # / ## / ### headings
 *   - paragraphs (plain text, blank-line separated)
 *   - bullet lists (- or *)
 *   - **bold** runs within text
 *   - markdown tables in pipe format
 * Anything more elaborate (links, code blocks, images) renders as plain text.
 * For complex tabular outputs prefer CSV or XLSX.
 */
async function generatePdf(markdown: string, title: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 56, bottom: 56, left: 56, right: 56 },
        info: { Title: title },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (e) => reject(e));

      // Title bar at the top of page 1.
      doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "left" });
      doc.moveDown(0.5);
      doc
        .strokeColor("#cbd5e1")
        .lineWidth(0.5)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.8);

      const lines = markdown.split(/\r?\n/);
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.length === 0) {
          doc.moveDown(0.5);
          i += 1;
          continue;
        }

        // Headings
        const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = headingMatch[2];
          const sizes = [16, 13, 12];
          doc.moveDown(0.4);
          doc.font("Helvetica-Bold").fontSize(sizes[level - 1]).text(text);
          doc.moveDown(0.2);
          i += 1;
          continue;
        }

        // Markdown table (header line followed by --- separator)
        if (trimmed.startsWith("|") && lines[i + 1]?.trim().startsWith("|") && /[-:]/.test(lines[i + 1])) {
          const tableLines: string[] = [];
          while (i < lines.length && lines[i].trim().startsWith("|")) {
            tableLines.push(lines[i]);
            i += 1;
          }
          renderTable(doc, tableLines);
          continue;
        }

        // Bullet list
        if (/^[-*]\s+/.test(trimmed)) {
          const items: string[] = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
            i += 1;
          }
          doc.font("Helvetica").fontSize(10.5);
          for (const item of items) {
            doc.text("•  ", { continued: true });
            renderInline(doc, item);
          }
          doc.moveDown(0.2);
          continue;
        }

        // Plain paragraph — gather consecutive non-blank, non-special lines.
        const paragraphLines: string[] = [line];
        i += 1;
        while (i < lines.length) {
          const next = lines[i];
          const nextTrim = next.trim();
          if (
            nextTrim.length === 0 ||
            /^(#{1,3})\s+/.test(nextTrim) ||
            /^[-*]\s+/.test(nextTrim) ||
            nextTrim.startsWith("|")
          ) {
            break;
          }
          paragraphLines.push(next);
          i += 1;
        }
        doc.font("Helvetica").fontSize(10.5);
        renderInline(doc, paragraphLines.join(" "));
        doc.moveDown(0.3);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Render inline markdown (only **bold** for now) into the current pdf cursor. */
function renderInline(doc: PDFKit.PDFDocument, text: string): void {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  for (let p = 0; p < parts.length; p += 1) {
    const part = parts[p];
    const isLast = p === parts.length - 1;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      doc.font("Helvetica-Bold").text(part.slice(2, -2), { continued: !isLast });
    } else {
      doc.font("Helvetica").text(part, { continued: !isLast });
    }
  }
}

/** Render a simple pipe-format markdown table. */
function renderTable(doc: PDFKit.PDFDocument, lines: string[]): void {
  const rows = lines
    .filter((l) => !/^\s*\|?\s*[-:|\s]+\s*\|?\s*$/.test(l)) // strip separator row
    .map((l) =>
      l
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim())
    );
  if (rows.length === 0) return;

  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colCount = rows[0].length;
  const colWidth = pageWidth / colCount;
  const rowHeight = 18;
  const startX = doc.page.margins.left;

  doc.fontSize(10);
  for (let r = 0; r < rows.length; r += 1) {
    const isHeader = r === 0;
    const y = doc.y;
    if (isHeader) {
      doc
        .rect(startX, y, pageWidth, rowHeight)
        .fillColor("#f1f5f9")
        .fill();
      doc.fillColor("#0f172a");
    }
    for (let c = 0; c < colCount; c += 1) {
      const x = startX + c * colWidth;
      doc
        .font(isHeader ? "Helvetica-Bold" : "Helvetica")
        .text(rows[r][c] ?? "", x + 4, y + 4, {
          width: colWidth - 8,
          height: rowHeight - 4,
          ellipsis: true,
        });
    }
    doc.y = y + rowHeight;
    if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
    }
  }
  doc.moveDown(0.5);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectHeaders(rows: ExportRow[]): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function sanitizeFilename(name: string, format: ExportFormat): string {
  let safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  if (!safe.toLowerCase().endsWith(`.${format}`)) {
    safe = `${safe.replace(/\.[^.]+$/, "")}.${format}`;
  }
  if (!safe || safe === `.${format}`) safe = `export.${format}`;
  return safe;
}
