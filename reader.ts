import fs from "fs";
import path from "path";

export const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt", ".docx", ".pdf"];

export async function readContract(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type "${ext || "none"}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ path: file })).value;
  }
  if (ext === ".pdf") {
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const data = await pdfParse(fs.readFileSync(file));
    const text = data.text.trim();
    if (text.length < 200) {
      throw new Error("This PDF has no selectable text (it may be a scan). Export it from Word or run OCR first.");
    }
    return text;
  }
  return fs.readFileSync(file, "utf-8");
}