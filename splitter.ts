import fs from "fs";
import path from "path";
import { readContract } from "./reader";

export const CLAUSE_KEYS = ["indemnification", "ip_ownership", "payment_terms"] as const;
export type ClauseKey = (typeof CLAUSE_KEYS)[number];

export interface ExtractedClause {
  key: ClauseKey;
  heading: string;
  text: string;
  score: number;
}

export interface SplitResult {
  found: ExtractedClause[];
  missing: ClauseKey[];
}

interface Section {
  heading: string;
  body: string;
}

const HEADING_HINTS: Record<ClauseKey, RegExp> = {
  indemnification: /indemn|liabilit|hold\s+harmless/i,
  ip_ownership: /intellectual\s+property|ownership|work\s+product|work\s+made\s+for\s+hire|\bIP\b/i,
  payment_terms: /payment|\bfees?\b|invoic|compensation|billing|acceptance/i,
};

const BODY_SIGNALS: Record<ClauseKey, RegExp[]> = {
  indemnification: [
    /indemnif/i,
    /hold\s+harmless/i,
    /\bdefend/i,
    /liabilit/i,
    /damages/i,
    /without\s+limitation/i,
    /attorneys.{0,3}\s+fees/i,
  ],
  ip_ownership: [
    /intellectual\s+property/i,
    /work\s+made\s+for\s+hire/i,
    /\bassign/i,
    /work\s+product/i,
    /ownership|\bowns?\b/i,
    /licen[sc]e/i,
    /deliverables/i,
  ],
  payment_terms: [
    /invoic/i,
    /\bnet[\s-]?\d+/i,
    /\(?\d+\)?\s*days\b/i,
    /\bpay(?:s|ment|able|ing)?\b/i,
    /pay[\s-]when[\s-]paid/i,
    /accept|approv/i,
    /\bfees?\b/i,
    /compensation|remit/i,
  ],
};

const HEADING_BONUS = 6;
const MIN_SCORE = 3;

const MD_HEADING = /^#{1,6}\s+\S/;
const NUMBERED_HEADING = /^(?:(?:Article|Section|ARTICLE|SECTION)\s+)?\d+[.)]?\s*[A-Z][^.!?;:]{2,70}$/;
const CAPS_HEADING = /^[A-Z][A-Z0-9 &/,'-]{3,60}$/;
const TITLE_HEADING = /^[A-Z][A-Za-z&/'-]{3,}(?:\s+(?:of|and|or|the|for|to|in|on|[A-Z][A-Za-z&/'-]*)){0,5}$/;

function isHeading(line: string): boolean {
  return (
    MD_HEADING.test(line) ||
    NUMBERED_HEADING.test(line) ||
    CAPS_HEADING.test(line) ||
    TITLE_HEADING.test(line)
  );
}

function cleanHeading(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/^(\d+[.)])(?=\S)/, "$1 ")
    .trim();
}

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let heading = "(start of document)";
  let buffer: string[] = [];

  const flush = () => {
    const joined = buffer.join("\n");
    const cut = joined.search(/\bIN WITNESS WHEREOF\b|^\s*(EXECUTION|SIGNATURES?)\b|^\s*By:\s*_{3,}/im);
    const body = (cut >= 0 ? joined.slice(0, cut) : joined).trim();
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  const allLines = text.split(/\r?\n/);
  const numberedCount = allLines.filter((l) => NUMBERED_HEADING.test(l.trim())).length;
  const numberedOnly = numberedCount >= 3;

  for (const raw of allLines) {
    if (/^[-=_*\s]{5,}$/.test(raw.trim())) continue;
    const line = raw.trim().replace(/^(\*\*|__)(.+?)\1:?$/, "$2");
    const indented = /^\s/.test(raw);
    const headingLike = numberedOnly
      ? MD_HEADING.test(line) || NUMBERED_HEADING.test(line)
      : isHeading(line);

    if (!indented && headingLike) {
      flush();
      heading = cleanHeading(line);
    } else {
      buffer.push(raw);
    }
  }
  flush();
  return sections;
}

function scoreSection(section: Section, key: ClauseKey): number {
  const headingScore = HEADING_HINTS[key].test(section.heading) ? HEADING_BONUS : 0;
  const bodyScore = BODY_SIGNALS[key].filter((re) => re.test(section.body)).length;
  return headingScore + bodyScore;
}

export function extractClauses(text: string): SplitResult {
  const sections = splitSections(text);

  const candidates: { key: ClauseKey; index: number; score: number }[] = [];
  sections.forEach((section, index) => {
    for (const key of CLAUSE_KEYS) {
      const score = scoreSection(section, key);
      const headingHit = HEADING_HINTS[key].test(section.heading);
      if (score >= MIN_SCORE && (headingHit || score >= 5)) {
        candidates.push({ key, index, score });
      }
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const usedKeys = new Set<ClauseKey>();
  const usedSections = new Set<number>();
  const picked: { key: ClauseKey; index: number; score: number }[] = [];

  for (const c of candidates) {
    if (usedKeys.has(c.key) || usedSections.has(c.index)) continue;
    usedKeys.add(c.key);
    usedSections.add(c.index);
    picked.push(c);
  }

  picked.sort((a, b) => a.index - b.index);
  const found: ExtractedClause[] = picked.map((c) => ({
    key: c.key,
    heading: sections[c.index].heading,
    text: sections[c.index].body,
    score: c.score,
  }));
  const missing = CLAUSE_KEYS.filter((k) => !usedKeys.has(k));
  return { found, missing };
}

if (require.main === module) {
  (async () => {
    const file = path.resolve(process.argv[2] ?? "sample_sow.md");
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
    const rawText = await readContract(file);
    const { found, missing } = extractClauses(rawText);

    console.log(`\nSplitter check: ${found.length} of ${CLAUSE_KEYS.length} target clauses found in ${path.basename(file)}\n`);
    for (const c of found) {
      console.log(`  ${c.key.padEnd(16)}  ${c.heading.padEnd(28)}  score ${String(c.score).padStart(2)}   ${c.text.length} chars`);
    }
    if (missing.length) console.log(`\n  Not found: ${missing.join(", ")}`);
    console.log("");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}