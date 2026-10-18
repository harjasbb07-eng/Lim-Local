import fs from "fs";
import type { ClauseKey } from "./splitter";
import type { AuditResponse, AuditStats } from "./auditor";

export interface ReportItem {
  key: ClauseKey;
  heading: string;
  text: string;
  audit?: AuditResponse;
  stats?: AuditStats;
  error?: string;
}

export interface ReportInput {
  sourceFile: string;
  model: string;
  attribution: string;
  items: ReportItem[];
  missing: ClauseKey[];
}

const LABELS: Record<ClauseKey, string> = {
  indemnification: "Indemnification and liability",
  ip_ownership: "IP ownership",
  payment_terms: "Payment terms",
};

const RISK_SENTENCE: Record<"HIGH" | "MEDIUM" | "LOW", string> = {
  HIGH: "One or more terms clearly depart from the PSA baseline and are worth raising before signing.",
  MEDIUM: "The clause departs from the PSA baseline in smaller ways.",
  LOW: "No checklist red flags were found in this section. This is not a guarantee that the clause is safe.",
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s)]*[^\s).,]/g, (u) => `<a href="${u}">${u}</a>`);
}

function copyLink(targetId: string): string {
  return `<span class="editsection">[<a href="#" data-copy="${targetId}">copy</a>]</span>`;
}

function cleanCitation(citation: string): string {
  const cleaned = citation.replace(/\bPSA\s*/gi, "").trim();
  return cleaned || "no section given";
}

function renderItem(item: ReportItem, index: number): string {
  const label = LABELS[item.key];
  const anchor = `clause-${index + 1}`;

  if (!item.audit) {
    return `
  <h2 id="${anchor}">${esc(label)}</h2>
  <div class="hatnote">Contract heading: &ldquo;${esc(item.heading)}&rdquo;</div>
  <div class="ambox ambox-none">
    <b>Not assessed.</b> The local model call failed: ${esc(item.error ?? "unknown error")}
  </div>
  <h3>Clause text</h3>
  <table class="wikitable">
    <tbody><tr><td class="prose">${esc(item.text)}</td></tr></tbody>
  </table>`;
  }

  const a = item.audit;
  const level = a.risk_level.toLowerCase();
  const issues = a.issues_found.map((i) => `<li>${esc(i)}</li>`).join("");

  if (a.risk_level === "LOW") {
    return `
  <h2 id="${anchor}">${esc(label)}</h2>
  <div class="hatnote">Contract heading: &ldquo;${esc(item.heading)}&rdquo;. Compared with Common Paper PSA ${esc(cleanCitation(a.common_paper_citation))}.</div>
  <div class="ambox ambox-low">
    Assessed as <b>low risk</b>. ${esc(RISK_SENTENCE.LOW)}
  </div>
  <h3>Clause text</h3>
  <table class="wikitable">
    <tbody><tr><td class="prose">${esc(item.text)}</td></tr></tbody>
  </table>`;
  }

  return `
  <h2 id="${anchor}">${esc(label)}</h2>
  <div class="hatnote">Contract heading: &ldquo;${esc(item.heading)}&rdquo;. Compared with Common Paper PSA ${esc(cleanCitation(a.common_paper_citation))}.</div>
  <div class="ambox ambox-${level}">
    Assessed as <b>${level} risk</b>. ${esc(RISK_SENTENCE[a.risk_level])}
  </div>

  <h3>Issues identified</h3>
  <ul>${issues || "<li>The model listed no specific issues.</li>"}</ul>

  <h3>Text comparison</h3>
  <table class="wikitable">
    <thead>
      <tr>
        <th>Original clause</th>
        <th>Suggested redline ${copyLink(`redline-${index}`)}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="prose">${esc(item.text)}</td>
        <td class="prose" id="redline-${index}">${esc(a.suggested_redline) || "No redline suggested for this section."}</td>
      </tr>
    </tbody>
  </table>

  <h3>Negotiation position ${copyLink(`pitch-${index}`)}</h3>
  <blockquote id="pitch-${index}">${esc(a.negotiation_talking_point) || "No negotiation line suggested."}</blockquote>`;
}

export function generateHtmlReport(input: ReportInput, outputPath: string): void {
  const audited = input.items.filter((i) => i.audit);
  const failed = input.items.length - audited.length;
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const item of audited) counts[item.audit!.risk_level]++;

  const totalSeconds = audited.reduce((sum, i) => sum + (i.stats?.seconds ?? 0), 0);
  const speeds = audited.map((i) => i.stats?.tokensPerSecond ?? 0).filter((s) => s > 0);
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  const generated = new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const n = input.items.length;

  const verdictParts: string[] = [];
  if (counts.HIGH) verdictParts.push(`${counts.HIGH} rated high risk`);
  if (counts.MEDIUM) verdictParts.push(`${counts.MEDIUM} rated medium risk`);
  if (counts.LOW) verdictParts.push(`${counts.LOW} rated low risk`);
  if (failed) verdictParts.push(`${failed} could not be assessed`);
  const verdict = verdictParts.length ? ` Of these, ${joinAnd(verdictParts)}.` : "";

  const missingNote = input.missing.length
    ? `<div class="ambox ambox-none"><b>Clauses not found.</b> No section matching these topics was located in this contract: ${joinAnd(
        input.missing.map((k) => esc(LABELS[k]))
      )}. A missing clause can matter too, so check the document by hand.</div>`
    : "";

  const tocClauses = input.items
    .map((item, i) => {
      const risk = item.audit
        ? ` <span class="toc-note">(${item.audit.risk_level.toLowerCase()} risk)</span>`
        : ` <span class="toc-note">(not assessed)</span>`;
      return `<li><a href="#clause-${i + 1}"><span class="tocnumber">${i + 1}</span> ${esc(LABELS[item.key])}</a>${risk}</li>`;
    })
    .join("\n        ");
  const methodNumber = n + 1;
  const attributionNumber = n + 2;

  const infoRows: string[] = [
    `<tr><th scope="row">Document</th><td>${esc(input.sourceFile)}</td></tr>`,
    `<tr><th scope="row">Reference</th><td>Common Paper Professional Services Agreement, Standard Terms</td></tr>`,
    `<tr><th scope="row">Model</th><td>${esc(input.model)}</td></tr>`,
    `<tr><th scope="row">Clauses reviewed</th><td>${n}</td></tr>`,
    `<tr><th scope="row">High risk</th><td>${counts.HIGH}</td></tr>`,
    `<tr><th scope="row">Medium risk</th><td>${counts.MEDIUM}</td></tr>`,
    `<tr><th scope="row">Low risk</th><td>${counts.LOW}</td></tr>`,
  ];
  if (failed) infoRows.push(`<tr><th scope="row">Not assessed</th><td>${failed}</td></tr>`);
  infoRows.push(`<tr><th scope="row">Processing</th><td>Entirely on this computer</td></tr>`);
  if (audited.length) {
    infoRows.push(
      `<tr><th scope="row">Run time</th><td>${totalSeconds.toFixed(0)} s${avgSpeed ? `, about ${avgSpeed.toFixed(0)} tokens/s` : ""}</td></tr>`
    );
  }
  infoRows.push(`<tr><th scope="row">Generated</th><td>${esc(generated)}</td></tr>`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contract triage report: ${esc(input.sourceFile)} - Lim Local</title>
<style>
  :root {
    --page-bg: #ffffff; --bg: #ffffff; --text: #202122; --muted: #54595d; --link: #0645ad; --visited: #0b0080;
    --border: #a2a9b1; --soft-border: #c8ccd1; --box-bg: #f8f9fa; --th-bg: #eaecf0; --info-head: #cedff2;
    --high-bg: #fee7e6; --high-line: #b32424; --med-bg: #fef6e7; --med-line: #fc3; --low-bg: #d5fdf4; --low-line: #14866d;
    --none-bg: #f8f9fa; --none-line: #a2a9b1;
  }
  html { background: var(--page-bg); }
  body { margin: 0; padding: 20px 12px; color: var(--text);
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
         font-size: 14px; line-height: 1.6; }
  a { color: var(--link); text-decoration: none; }
  a:visited { color: var(--visited); }
  a:hover { text-decoration: underline; }
  .page { max-width: 980px; margin: 0 auto; background: var(--bg); border: 1px solid var(--soft-border); padding: 20px 28px 32px; }
  h1, h2 { font-family: "Linux Libertine", Georgia, "Times New Roman", serif; font-weight: normal; color: var(--text);
           border-bottom: 1px solid var(--border); line-height: 1.3; }
  h1 { font-size: 1.9em; margin: 0 0 4px; padding-bottom: 2px; }
  h2 { font-size: 1.5em; margin: 1.5em 0 0.6em; padding-bottom: 2px; clear: right; }
  h3 { font-size: 1.1em; font-weight: bold; margin: 1.2em 0 0.4em; }
  .tagline { font-size: 0.85em; color: var(--muted); margin: 0 0 14px; }
  p { margin: 0.5em 0; }
  ul { margin: 0.3em 0 0.5em 1.6em; padding: 0; }
  li { margin-bottom: 0.25em; }

  .infobox { float: right; clear: right; width: 22em; margin: 0.4em 0 1em 1.4em; border: 1px solid var(--border);
             background: var(--box-bg); font-size: 0.88em; border-collapse: collapse; }
  .infobox caption { background: var(--info-head); font-weight: bold; padding: 6px 8px; text-align: center; font-size: 1.05em;
                     border: 1px solid var(--border); border-bottom: 0; }
  .infobox th, .infobox td { padding: 3px 8px; vertical-align: top; text-align: left; border-top: 1px solid var(--soft-border); }
  .infobox th { font-weight: bold; width: 38%; }

  .toc { display: table; background: var(--box-bg); border: 1px solid var(--border); padding: 8px 16px 8px 12px; font-size: 0.95em; margin: 0.8em 0 1em; }
  .toc-title { font-weight: bold; text-align: center; margin-bottom: 4px; }
  .toc ol { list-style: none; margin: 0; padding: 0; }
  .toc li { margin: 1px 0; }
  .tocnumber { color: var(--muted); margin-right: 4px; }
  .toc-note { color: var(--muted); font-size: 0.9em; }

  .hatnote { font-style: italic; padding-left: 1.6em; margin: 0.2em 0 0.8em; color: var(--text); }
  .ambox { border: 1px solid var(--border); border-left-width: 10px; padding: 7px 12px; margin: 0.6em 0 1em; }
  .ambox-high { background: var(--high-bg); border-left-color: var(--high-line); }
  .ambox-medium { background: var(--med-bg); border-left-color: var(--med-line); }
  .ambox-low { background: var(--low-bg); border-left-color: var(--low-line); }
  .ambox-none { background: var(--none-bg); border-left-color: var(--none-line); }

  .wikitable { width: 100%; background: var(--box-bg); border: 1px solid var(--border); border-collapse: collapse; margin: 0.6em 0 1em; }
  .wikitable th, .wikitable td { border: 1px solid var(--border); padding: 0.4em 0.6em; vertical-align: top; text-align: left; }
  .wikitable th { background: var(--th-bg); width: 50%; }
  .wikitable td { background: var(--bg); }
  .prose { white-space: pre-wrap; word-wrap: break-word; }

  blockquote { margin: 0.6em 0 1em 1.6em; padding: 0.2em 0 0.2em 1em; border-left: 3px solid var(--border); font-style: italic; }
  .editsection { font-size: 0.8em; font-weight: normal; font-family: -apple-system, "Segoe UI", Arial, sans-serif; margin-left: 0.6em; color: var(--muted); }
  .colophon { margin-top: 2em; padding-top: 8px; border-top: 1px solid var(--soft-border); font-size: 0.82em; color: var(--muted); }

  @media (max-width: 720px) {
    .page { padding: 14px 14px 24px; }
    .infobox { float: none; width: 100%; margin: 0.6em 0 1em; box-sizing: border-box; }
    .wikitable th, .wikitable td { display: block; width: auto; }
  }
  @media print { .editsection { display: none; } html, body { background: #fff; } }
</style>
</head>
<body>
<div class="page">

  <h1>Contract triage report: ${esc(input.sourceFile)}</h1>
  <div class="tagline">From Lim Local, the offline contract triage tool</div>

  <table class="infobox">
    <caption>Audit summary</caption>
    <tbody>
      ${infoRows.join("\n      ")}
    </tbody>
  </table>

  <p>This report compares ${n} clause${n === 1 ? "" : "s"} of <b>${esc(input.sourceFile)}</b> with the Common Paper Professional Services Agreement (PSA) Standard Terms.${esc(verdict)} It is a preliminary automated triage and not legal advice (see <a href="#method">Method and limitations</a>).</p>

  ${missingNote}

  <div class="toc">
    <div class="toc-title">Contents</div>
    <ol>
        ${tocClauses}
        <li><a href="#method"><span class="tocnumber">${methodNumber}</span> Method and limitations</a></li>
        <li><a href="#attribution"><span class="tocnumber">${attributionNumber}</span> Attribution</a></li>
    </ol>
  </div>
${input.items.map(renderItem).join("\n")}

  <h2 id="method">Method and limitations</h2>
  <p>Each clause was located in the contract by its heading and keywords, then compared by a language model running locally with the matching PSA sections. Ratings, citations and redlines are machine-generated and can be wrong or incomplete. Check every suggested redline against the full contract.</p>
  <p>Lim Local is an automated heuristic and clause-comparison tool designed for preliminary contract triage. It does not provide legal advice or create an attorney-client relationship. Have a qualified lawyer review anything you plan to sign.</p>

  <h2 id="attribution">Attribution</h2>
  <p>${linkify(esc(input.attribution))}</p>

  <div class="colophon">This page was generated on ${esc(generated)} by Lim Local using ${esc(input.model)}. All processing took place on this computer.</div>
</div>
<script>
  document.querySelectorAll("a[data-copy]").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      var el = document.getElementById(a.getAttribute("data-copy"));
      var text = el ? el.textContent.trim() : "";
      function done() {
        var old = a.textContent;
        a.textContent = "copied";
        setTimeout(function () { a.textContent = old; }, 1500);
      }
      function fallback() {
        var t = document.createElement("textarea");
        t.value = text;
        document.body.appendChild(t);
        t.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(t);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });
  });
</script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
}