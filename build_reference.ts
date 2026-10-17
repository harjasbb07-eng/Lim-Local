import fs from "node:fs";
import path from "node:path";

// Run from the project root (D:\Lim):  npx tsx build_reference.ts
const ROOT = process.cwd();
const PSA_PATH = path.join(ROOT, "vendor", "PSA", "psa.md");
const OUT_PATH = path.join(ROOT, "reference_clauses.json");
const MIN_LEN = Number(process.env.MIN_LEN ?? 120);

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(PSA_PATH)) fail(`Cannot find ${PSA_PATH}`);

const lines = fs.readFileSync(PSA_PATH, "utf-8").split(/\r?\n/);

// psa.md format:
//   "9. <span class="header_2">Indemnification</span>"            -> top-level section
//   "    1. <span class="header_3">Title.</span>  body text"       -> subsection (4 spaces)
//   "        a. body text"                                         -> sub-item (8 spaces)
const TOP = /^(\d+)\.\s+<span class="header_2">(.*?)<\/span>/;
const SUB = /^ {4}(\d+)\.\s+(.*)$/;

interface Entry {
  title: string;
  lines: string[];
}

const subs = new Map<string, Entry>();
const topTitles = new Map<number, string>();

function titleOf(raw: string): string {
  const h3 = raw.match(/<span class="header_3">(.*?)<\/span>/);
  if (h3) return h3[1].replace(/\.$/, "").trim();
  const def = raw.match(/^\*\*"(.*?)"\*\*/); // Section 13 definitions
  if (def) return def[1];
  return "";
}

// Strip HTML span markup and bold markers only; wording is left unchanged.
function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

let top = 0;
let cur: string | null = null;
for (const line of lines) {
  const t = line.match(TOP);
  if (t) {
    top = Number(t[1]);
    topTitles.set(top, clean(t[2]));
    cur = null;
    continue;
  }
  const s = line.match(SUB);
  if (s && top > 0) {
    cur = `${top}.${s[1]}`;
    subs.set(cur, { title: titleOf(s[2]), lines: [s[2]] });
    continue;
  }
  if (cur && line.trim()) subs.get(cur)!.lines.push(line);
}

interface Block {
  ref: string;
  section_title: string;
  title: string;
  text: string;
}

function get(ref: string): Block {
  const e = subs.get(ref);
  if (!e) fail(`Section ${ref} not found in psa.md (parsed ${subs.size} subsections)`);
  const text = e.lines.map(clean).filter(Boolean).join("\n");
  if (text.length < MIN_LEN) fail(`Section ${ref} too short (${text.length} chars): "${text}"`);
  return {
    ref: `§${ref}`,
    section_title: topTitles.get(Number(ref.split(".")[0])) ?? "",
    title: e.title,
    text,
  };
}

const referenceData = {
 attribution:
    "Common Paper Professional Services Agreement (PSA) Standard Terms v1.1, © Common Paper, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://github.com/CommonPaper/PSA. Changes made: HTML formatting removed; wording otherwise unchanged. Not endorsed by Common Paper. The tool principles and red flags used in this comparison are Lim Local's own interpretation, not Common Paper text.",
  source_file: "vendor/PSA/psa.md",
  cover_page_note:
    "psa.md contains the Standard Terms only. Values such as the General Cap Amount, Time of Assignment, Payment Period, Rejection Period and Covered Claims are Cover Page/SOW variables that each deal sets, so they are not fixed defaults in this file.",
  clauses: {
    indemnification: {
      clause_type: "indemnification",
      verbatim_sections: ["8.1", "8.2", "8.3", "9.1", "9.2", "9.3", "9.4"].map(get),
      tool_principle:
        "Indemnity is mutual and limited to claims brought by third parties (§9.1, §9.2); each party's Covered Claims are defined on the Cover Page. Indemnity is the exclusive remedy for a Covered Claim (§9.4). Liability is capped (§8.1) at an amount negotiated on the Cover Page, and lost profits and consequential damages are waived (§8.2). Anything outside the cap has to be named as an Unlimited Claim (§8.3).",
      red_flags: [
        "One-sided indemnity where only the Contractor indemnifies (the PSA is mutual, §9.1-9.2)",
        "Indemnity triggered by any breach or by the Contractor's services in general, instead of defined third-party Covered Claims (§9.1)",
        "No liability cap, or 'without limitation' language (§8.1, §8.3)",
        "No waiver of lost profits and consequential damages (§8.2)",
      ],
    },
    ip_ownership: {
      clause_type: "ip_ownership",
      verbatim_sections: ["2.1", "2.3", "13.14"].map(get),
      tool_principle:
        "The Provider assigns Deliverables to the Customer at a Time of Assignment chosen in the SOW: either as they are created or upon payment of the associated Fees (§2.1). Pre-Existing Materials and Third-Party Materials are excluded from the assignment, and the Customer only receives a license to Pre-Existing Materials needed to use the Deliverables (§2.3, §13.14). The PSA's own commentary avoids the work-made-for-hire concept. A contractor-friendly contract ties assignment to payment and keeps reusable tools and libraries out of the assignment.",
      red_flags: [
        "Assignment on creation regardless of whether fees have been paid (the PSA treats Time of Assignment as a negotiated choice, §2.1)",
        "'Work made for hire' or blanket assignment of all tools, libraries and materials used by the Contractor, instead of excluding Pre-Existing Materials (§2.1, §2.3)",
        "Contractor's reusable tooling is assigned rather than licensed (§2.3)",
      ],
    },
    payment_terms: {
      clause_type: "payment_terms",
      verbatim_sections: ["1.4", "4.2", "4.4"].map(get),
      tool_principle:
        "The Customer pays invoiced Fees within a Payment Period set in the SOW; 30 days from receipt of invoice is only the template's example, not a fixed default (§4.2). Good-faith invoice disputes must be raised within the Payment Period and undisputed amounts must still be paid on time (§4.4). Where acceptance applies, a Deliverable is deemed approved if not rejected within the SOW's Rejection Period (§1.4). The PSA does not make payment conditional on the Customer being paid by its own customers.",
      red_flags: [
        "Payment period much longer than the common 30-day example, such as 60 or 90 days (tool heuristic; the PSA leaves the period to the SOW, §4.2)",
        "Pay-when-paid: payment conditioned on the client being paid by its own customers (§4.2 requires payment within the Payment Period)",
        "Acceptance in the client's sole discretion with no deemed-approval deadline (§1.4)",
        "Withholding undisputed amounts, or no dispute process (§4.4)",
      ],
    },
  },
};

fs.writeFileSync(OUT_PATH, JSON.stringify(referenceData, null, 2), "utf-8");

console.log(`Parsed ${subs.size} subsections from psa.md. Wrote ${OUT_PATH}\n`);
for (const [type, c] of Object.entries(referenceData.clauses)) {
  for (const b of c.verbatim_sections) {
    console.log(`${type.padEnd(15)} ${b.ref.padEnd(7)} ${String(b.text.length).padStart(5)} chars  ${b.title}`);
  }
}