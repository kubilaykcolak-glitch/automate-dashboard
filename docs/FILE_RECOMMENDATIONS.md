# File and data recommendations (per agent)

> **Audience:** prep material for an in-app "what should I upload?" guide. Tells users which files genuinely help each agent and what the ideal structure looks like.

The agents only see what the user attaches to a message. Better files in → categorically better answers out. Bad or missing files force the agent to ask clarifying questions or guess.

---

## Accountancy agent

### What helps most (in priority order)

1. **Bank statement CSV exports** — current account, savings, and any business credit cards. CSV beats PDF for accuracy. The agent reads thousands of transactions reliably from a CSV; PDFs can lose column alignment.
2. **PayPal / Stripe / Square statements** — same CSV preference. Especially valuable when revenue flows through these and the business bank only sees the net deposit.
3. **Receipts and invoices**, individual files or a zipped folder (when zip support lands — currently upload them individually). PDF is fine here.
4. **Previous year's accounts** or Self Assessment summary — gives the agent baseline categorisations to match against this year's data.
5. **HMRC correspondence** — VAT registration confirmation, UTR letter, payments on account notices.

### What helps less

- Photos of paper receipts — the agent can read clear ones via OCR-quality PDFs but quality is variable. Prefer scanned PDFs over phone photos.
- Spreadsheets with merged cells or rich formatting — XLSX is supported but works best when the data is in a flat tabular form on one sheet.

### Ideal CSV column structure

For bank statements, the most useful columns are:

```
Date, Description, Amount, Balance, Category (optional)
```

Some banks export `Money In` and `Money Out` as separate columns instead of a signed `Amount` — that works too. The agent reads either shape. What it cannot do:

- Reliably parse statements where the date format is ambiguous (e.g. `01/02/2026` could be 1 Feb or 2 Jan). Bias toward ISO `YYYY-MM-DD` or UK `DD/MM/YYYY`.
- Read scanned image-only PDFs — those need OCR upstream.

### Worked example: a clean monthly bookkeeping upload

```
Bank-statement-2026-04.csv           ← current account
PayPal-summary-2026-04.csv           ← payment processor
Expenses-receipts-2026-04.pdf        ← combined receipts PDF
```

Three files, one month, one minute to upload. The accountancy agent can then:

- Categorise every transaction.
- Cross-check PayPal income against bank deposits.
- Match receipts to outgoing transactions.
- Flag anomalies and missing receipts.

### Worked example: a quarterly VAT review

```
Bank-statement-Q1-2026.csv
Sales-invoices-Q1-2026.pdf           ← combined sales side
Purchase-invoices-Q1-2026.pdf        ← combined purchase side
Last-VAT-return.pdf                  ← prior period for baseline
```

## Operations agent

### What helps most

1. **The actual email thread or document** you want help with — paste it into the chat or upload as `.docx` / `.pdf`.
2. **Meeting notes** — markdown, `.docx`, or pasted text.
3. **Existing process docs** when asking for refinement or automation — `.docx` or `.pdf`.
4. **Voice / tone samples** of how you usually write, when asking for drafts. Three or four past emails is enough.

### What helps less

- Hundreds of pages of context dumped at once — focus on the document you actually need the agent to work with.
- Confidential documents you should not be uploading to a third-party service. Sanitise before sharing.

## General assistant

### What helps most

- Whatever the question is actually about — there is no fixed format here.
- For long-form analysis: the source document, not a summary of it.
- For drafting: examples of the output style you want.

---

## Universal rules (apply to every agent)

### File hygiene

- **One topic per file.** A 200-page PDF with bank statements, receipts, contracts, and a recipe for muffins forces the agent to triage. Split by topic before uploading.
- **Name files descriptively.** `Bank-statement-2026-04.csv` is better than `Statement(2).csv`. The agent uses filenames in its citations.
- **Drop sensitive identifiers if you can.** National Insurance numbers, full bank account numbers, passwords. The agent doesn't need them and they sit in your storage.

### What the agent CAN do with a file

- PDF: extracted text via `pdf-parse` v2. Works well for digitally-generated PDFs; struggles with scanned image PDFs unless OCR'd first.
- XLSX / XLS: parsed via `xlsx`. Reads all sheets, all cells. Best on tabular data.
- CSV: parsed as plain text and structured by the agent.
- DOCX: parsed via `mammoth`. Reads body text, lists, tables. Loses fancy formatting.
- DOC (legacy): supported but flakier than DOCX.

### What the agent CANNOT do (yet)

- Re-open a previously uploaded file unless you re-attach it in the current message.
- See images embedded in documents — only the text around them.
- Edit and return modified files. It can produce a new document but it can't redline an existing PDF.
- Read live data from Google Sheets, QuickBooks, Xero, etc. — that needs the integration framework to be wired up (planned).

### Size limits

- 20 MB per file.
- 500 MB total per user (across all uploads).
- Hitting the cap: delete or replace older files via `/dashboard/files`.

---

## Maintenance contract

When you add a new agent, a new file type, or change the upload limits, update this file. Tell users what they can do *now*, not what the roadmap might allow.
