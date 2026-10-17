import fs from "fs";
import path from "path";
import { extractClauses } from "./splitter";
import { auditSingleClause, checkOllama, MODEL, ReferenceData } from "./auditor";
import { generateHtmlReport, ReportItem } from "./generate_report";
import { readContract } from "./reader";

const ROOT = process.cwd();

async function main() {
  const inputFile = process.argv[2] ?? "sample_sow.md";
  const inputPath = path.resolve(ROOT, inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const refPath = path.join(ROOT, "reference_clauses.json");
  if (!fs.existsSync(refPath)) {
    console.error("reference_clauses.json not found. Run: npx tsx build_reference.ts");
    process.exit(1);
  }

  const ollamaIssue = await checkOllama();
  if (ollamaIssue) {
    console.error(ollamaIssue);
    process.exit(1);
  }

  const refData = JSON.parse(fs.readFileSync(refPath, "utf-8")) as ReferenceData;
  const rawText = await readContract(inputPath);
  const { found, missing } = extractClauses(rawText);

  console.log("\nLim Local\n");
  console.log(`  Input   ${path.basename(inputPath)}`);
  console.log(`  Model   ${MODEL}`);
  console.log(`  Found   ${found.length} of 3 target clauses (${found.map((c) => c.key).join(", ") || "none"})\n`);

  const started = Date.now();
  const items: ReportItem[] = [];

  for (const clause of found) {
    try {
      const { audit, stats } = await auditSingleClause(clause.key, clause.text, refData.clauses[clause.key]);
      console.log(
        `  ${clause.key.padEnd(16)}  ${audit.risk_level.padEnd(6)}  ${stats.seconds.toFixed(1).padStart(5)} s  ${stats.tokensPerSecond.toFixed(1).padStart(5)} tokens/s`
      );
      items.push({ key: clause.key, heading: clause.heading, text: clause.text, audit, stats });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${clause.key.padEnd(16)}  failed: ${msg}`);
      items.push({ key: clause.key, heading: clause.heading, text: clause.text, error: msg });
      process.exitCode = 1;
    }
  }

  const outputPath = path.join(ROOT, "audit_report.html");
  generateHtmlReport(
    {
      sourceFile: path.basename(inputPath),
      model: MODEL,
      attribution: refData.attribution,
      items,
      missing,
    },
    outputPath
  );

  const totalSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nDone in ${totalSec} s. Report written to ${path.relative(ROOT, outputPath)}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});