# Lim Local

Air-gapped, zero-egress contract risk triage for independent contractors and boutique agencies, powered by Gemma 4 and Common Paper standard terms.

## Overview

Independent contractors and boutique agencies frequently receive client-drafted Master Services Agreements (MSAs) and Statements of Work (SOWs) containing aggressive terms:
* Net-90 or "pay-when-paid" payment conditions.
* Immediate, unconditioned assignment of intellectual property before invoices are paid.
* Broad, uncapped indemnification obligations without mutual protections or consequential damage waivers.

Retaining commercial counsel costs between $300 and $800 per hour, a prohibitive expense for routine project statements of work. At the same time, uploading unexecuted client agreements to public cloud LLM APIs directly breaches mutual non-disclosure agreements (NDAs) and confidentiality covenants.

Lim Local solves this dilemma by performing deterministic clause parsing and schema-constrained local inference entirely on the user's machine. No telemetry, no cloud API calls, and zero external network requests.

## Key Features

* 100% Air-Gapped Operation: Executes entirely against a local Ollama instance (`127.0.0.1:11434`) using the Gemma 4 quantized model (`gemma4:e2b-it-qat`). All contract data remains strictly on your local disk.
* Deterministic Clause Extraction: A specialized heading and signal-weighted tokenizer reliably segments target clauses (`payment_terms`, `ip_ownership`, `indemnification`) from Markdown contracts.
* Verbatim Standard Baseline: Assesses incoming clauses against the official Common Paper Professional Services Agreement (PSA) Standard Terms v1.1.
* Structured Risk Classification: Outputs calibrated risk ratings (`LOW`, `MEDIUM`, `HIGH`), section-specific citations, itemized deviations, fair counter-redlines, and actionable negotiation talking points.
* Clean MediaWiki Document Styling: Generates a self-contained, publication-grade `audit_report.html` modeled after the clean, neutral typography of Wikipedia (Linux Libertine/Georgia serifs, #a2a9b1 borders, summary infobox, and quick-copy action links). No bloated web frameworks, no round badges, and no pastel AI styling.

## System Requirements

* Operating System: Windows 10/11, macOS, or Linux
* Hardware: 8 GB or more of system RAM; 4 GB+ VRAM recommended for GPU acceleration
* Runtime: Node.js v18 or later
* Local Inference: Ollama v0.40.0+ with `gemma4:e2b-it-qat` installed

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Verify Ollama is running and has the required Gemma 4 model:
```bash
ollama pull gemma4:e2b-it-qat
```

3. (Optional) Rebuild the reference dataset from the vendor PSA source:
```bash
npm run build:reference
```

4. Run an audit against a target contract or SOW:
```bash
npm run audit sample_sow.md
```

5. Open the generated report in any browser:
```bash
start audit_report.html
```

## Available Scripts

* `npm run audit [path]`: Run the end-to-end triage CLI on any Markdown contract (defaults to `sample_sow.md`).
* `npm run build:reference`: Parse `vendor/PSA/psa.md` and regenerate `reference_clauses.json`.
* `npm run split:check`: Test the deterministic clause extractor against target fixtures.
* `npm run typecheck`: Run TypeScript compilation check without emitting files.
* `npm test`: Run both typecheck and splitter verification.

## Architecture and Workflow

```
[Contract Markdown]
        │
        ▼
[splitter.ts] ──────► Deterministic heading hints & weighted body signals
        │             (payment_terms, ip_ownership, indemnification)
        ▼
[auditor.ts]  ──────► Verbatim Common Paper PSA baseline from reference_clauses.json
        │             Constrained JSON schema generation via Ollama (127.0.0.1:11434)
        ▼             Model: gemma4:e2b-it-qat (num_ctx: 8192, temperature: 0.1, think: false)
[generate_report.ts] ─► Wikipedia/MediaWiki document engine
        │
        ▼
[audit_report.html]  ─► Flat, self-contained HTML triage report with side-by-side redlines
```

## Hacktoberfest 2026 Challenge Context

* Track: Week 2 Challenge (Theme: Side Hustle)
* Target Partner Prize: Best Use of Gemma ($200 USD)
* Submission Tags: `#devchallenge`, `#hf26challenge`

Lim Local demonstrates how open-source, small language models enable practical side hustles and freelance operations by removing high legal overhead without compromising client confidentiality.

## Legal Disclaimer

Lim Local is an automated heuristic and clause-comparison tool designed for preliminary contract triage. It does not provide legal advice, does not establish an attorney-client relationship, and is not a substitute for counsel. Users must have a qualified attorney review any legal agreement prior to execution.

## Attribution

Common Paper Professional Services Agreement Standard Terms, copyright Common Paper, licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
Source repository: https://github.com/CommonPaper/PSA

Modifications: HTML markup stripped; wording otherwise unchanged. This project is not sponsored or endorsed by Common Paper. The tool principles, red-flag checklists, and risk assessments are Lim's own interpretations and do not represent the views of Common Paper.
