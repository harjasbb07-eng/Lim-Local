# Lim Local

An offline contract triage tool for independent contractors and small agencies. It reads a client contract, finds three high-risk clauses, compares them with the Common Paper standard terms, and writes a single-file HTML report with risk ratings, redlines and negotiation lines. Everything runs on your own machine with a local Gemma 4 model through Ollama.

Lim Local is a preliminary triage aid. It is not legal advice.

## The problem

Freelancers and boutique studios regularly receive client-drafted Master Services Agreements (MSAs) and Statements of Work (SOWs) that contain unbalanced terms:

* Long payment periods (Net-60, Net-90) or "pay-when-paid" conditions.
* Immediate assignment of all work product, including the contractor's own pre-existing tools, whether or not the client has paid.
* One-sided, uncapped indemnification with no waiver of lost profits or consequential damages.

A commercial contracts lawyer costs roughly $300 to $800 per hour, which is hard to justify for a routine SOW. Pasting an unsigned client contract into a cloud AI service can breach the confidentiality terms of an NDA. Lim Local keeps the contract on the contractor's computer, so neither problem blocks a first review.

## What it does

1. Reads the contract (`.md`, `.txt`, `.docx` or text-based `.pdf`).
2. Splits it into sections and picks one section each for payment terms, IP ownership and indemnification and liability.
3. Compares each section with verbatim sections of the Common Paper Professional Services Agreement (PSA) Standard Terms v1.1.
4. Detects red flags with code-level rules, and uses the local Gemma 4 model to write a suggested redline and a polite negotiation line.
5. Writes `audit_report.html`, a standalone document styled after Wikipedia, with a risk rating per clause, quoted evidence, a side-by-side comparison and copy buttons.

## How ratings work

Ratings come from code, not from the model.

| Rating | Meaning |
| --- | --- |
| HIGH | Two or more checklist red flags were found in the section. |
| MEDIUM | One red flag was found, or the section is missing something worth checking, such as a stated payment deadline or a retainage holdback. |
| LOW | No checklist red flags were found. This is not a guarantee that the clause is safe. |

If no section for a clause type is found, the report says so. A missing clause can matter as much as a bad one, so check the document by hand.

For each red flag, the report quotes the sentence from the contract that triggered it. The model never decides the rating. It only writes the redline and the negotiation line, and those are checked so they do not mention Common Paper section numbers or defined terms.

## Supported formats

| Format | Notes |
| --- | --- |
| Markdown (`.md`, `.markdown`) | Read directly. |
| Plain text (`.txt`) | Read directly. Headings such as `PAYMENT` or `Intellectual Property` are recognized. |
| Word (`.docx`) | Parsed locally with `mammoth`. Signature blocks are cut off. |
| PDF (`.pdf`) | Parsed locally with `pdf-parse`. Text-based PDFs only. |

Scanned or image-only PDFs are rejected with a message asking you to export from Word or run OCR first.

## Requirements

* Node.js 18 or later.
* [Ollama](https://ollama.com) with the `gemma4:e2b-it-qat` model.
* A GPU with about 4 GB of VRAM is recommended. The model uses roughly 1.7 GB of VRAM once loaded.

Tested on Windows 11, Node.js, Ollama 0.40.5, an NVIDIA RTX 4050 Laptop GPU (6 GB VRAM) and 16 GB of system RAM. Other setups should work but have not been tested.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Download the model (one time, needs internet):

```bash
ollama pull gemma4:e2b-it-qat
```

3. Make sure Ollama is running, then audit a contract:

```bash
npm run audit -- sample_sow.md
```

You can also call it directly:

```bash
npx tsx audit.ts sample_sow.md
```

4. Open `audit_report.html` in your browser.

The repository includes `vendor/PSA` and a generated `reference_clauses.json`, so you do not need to rebuild the reference data. To regenerate it from the bundled Common Paper source:

```bash
npm run build:reference
```

After the model is downloaded, an audit makes no network calls except to Ollama on `127.0.0.1:11434`.

## Included samples

| File | Purpose |
| --- | --- |
| `sample_sow.md` | Contract with deliberate traps: Net-90, pay-when-paid, immediate IP assignment, one-sided uncapped indemnity. |
| `sample_fair_sow.md` | Balanced contract based on Common Paper style terms. Should come back LOW. |
| `messy_sow.txt` | Unnumbered plain-text headings, to test the splitter. |
| `example.txt` | A longer government-style SOW that defers most legal terms to a master contract. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run audit -- <file>` | Runs the full triage on a contract file. Defaults to `sample_sow.md`. |
| `npm run build:reference` | Rebuilds `reference_clauses.json` from `vendor/PSA/psa.md`. |
| `npm run split:check -- <file>` | Shows which sections the splitter picks, without calling the model. |
| `npm run typecheck` | Runs `tsc --noEmit`. |

Set the `LEXI_MODEL` environment variable to try a different Ollama model, for example `gemma4:e4b`. Only `gemma4:e2b-it-qat` has been tested.

## How it works

1. `reader.ts` extracts raw text from the input file.
2. `splitter.ts` splits the text into sections using Markdown, numbered, uppercase and title-case headings. It scores each section against heading hints and body keywords, and assigns at most one section to each clause type. Cover-page labels, divider lines and signature blocks are ignored.
3. `audit.ts` loads `reference_clauses.json`, which holds 13 verbatim Common Paper PSA subsections plus Lim Local's own red-flag checklists.
4. `auditor.ts` sends each clause to Ollama with a JSON schema, `temperature: 0.1`, `num_ctx: 8192` and `think: false`. Pattern guards decide which red flags are present, and the clause text supplies the quoted evidence.
5. `generate_report.ts` writes the self-contained HTML report. All contract and model text is HTML-escaped.

## Tested behavior

| Document | Result |
| --- | --- |
| `sample_sow.md` | Payment, IP and indemnification all HIGH, each with quoted evidence. |
| `sample_fair_sow.md` | All three LOW. Also tested as `.docx` and `.pdf` with the same result. |
| `messy_sow.txt` | All three found and rated HIGH. |
| `example.txt` | Payment found and rated MEDIUM (no deadline stated, retainage holdback). IP and indemnification reported as not found. |

These are small test sets and several rules were tuned while looking at them. Treat the results as a demonstration, not a measured accuracy figure. No independent user testing has been done yet.

## Known limitations

* **English only.** Red-flag rules are keyword patterns written for English contracts.
* **One section per clause type.** Terms spread across several sections, addenda or catch-all clauses may be missed.
* **Master agreements.** A SOW that defers liability or IP to a separate master agreement will report those clauses as not found. Lim Local only reads the file you give it.
* **Rule-based detection.** Unusual wording can slip past the patterns, and some phrasings can trigger a flag that does not fit. Always read the quoted evidence.
* **Redlines are suggestions.** The model can add terms that are not in the original, such as a 30-day payment period. Compare every redline with the full contract.
* **Scanned PDFs** are not supported, and PDFs with unusual layouts may split incorrectly.
* **Small model.** `gemma4:e2b-it-qat` is a small model. Its redlines and negotiation lines need human review.
* **Scope.** Only three clause types are checked. Non-compete, governing law, termination and similar clauses are not.

## Commercial direction

The command-line tool is open source under the MIT license. Possible paid directions, none of which exist yet:

* A packaged desktop app with an embedded local model runner, sold as a one-time license to freelancers and small agencies.
* Paid clause packs for non-compete, jurisdiction and master services terms.

## Hacktoberfest 2026

Submission for the Hacktoberfest 2026 Open-Source AI Challenge, Week 2, theme "Side Hustle". Target partner category: Best Use of Gemma. Tags: `#devchallenge`, `#hf26challenge`.

## Legal disclaimer

Lim Local is an automated heuristic and clause-comparison tool for preliminary triage. It does not provide legal advice, does not create an attorney-client relationship, and is not a substitute for a qualified lawyer. Have a lawyer review any agreement before you sign it.

## Attribution

Reference text comes from the [Common Paper Professional Services Agreement (PSA) Standard Terms v1.1](https://github.com/CommonPaper/PSA), copyright Common Paper, licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Changes made: HTML and Markdown formatting were stripped; the wording is unchanged. This project is not sponsored by or affiliated with Common Paper. The tool principles, red-flag checklists and risk assessments are Lim Local's own interpretations and are not Common Paper text.
