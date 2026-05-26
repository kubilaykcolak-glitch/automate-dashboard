---
name: uk-vat-mtd
description: Apply when the user asks about Making Tax Digital for VAT — who must comply, digital record-keeping rules, MTD-compatible software, bridging software, exemptions, and how submissions work. Also covers the MTD for Income Tax Self Assessment rollout.
tags: vat, hmrc, mtd, making-tax-digital
---

# Making Tax Digital (MTD) — UK rules

MTD is HMRC's programme to modernise the tax system through digital record-keeping and software-based submissions. VAT-registered businesses are already in scope; Income Tax for sole traders and landlords rolls out from April 2026.

## MTD for VAT — who's in scope

**Every VAT-registered business**, regardless of turnover, since April 2022. There is no turnover threshold below which MTD doesn't apply if you're VAT-registered.

If a business is voluntarily registered (turnover under £90,000) it's still in MTD.

## What "compliance" actually requires

Three rules:

1. **Keep digital records** of all VAT transactions in MTD-compatible software. Paper records and unintegrated spreadsheets are not enough on their own.
2. **Use functional compatible software** to file the VAT return via HMRC's API. The web portal manual entry is closed for MTD-registered businesses.
3. **Maintain digital links** between systems. If data moves between two systems (e.g. an invoicing tool and the VAT return software), the link must be digital — no manual retyping or copy-paste.

## MTD-compatible software

HMRC publishes a list of approved software at gov.uk/guidance/find-software-thats-compatible-with-making-tax-digital-for-vat. Common options:

| Software | Notes |
|---|---|
| Xero | Full-stack accountancy. Standard recommendation. |
| QuickBooks | Full-stack. Strong US presence; UK version is MTD-compatible. |
| FreeAgent | UK-focused, free with NatWest/RBS business accounts. |
| Sage Business Cloud | Mid-market established player. |
| Crunch / Pandle / FreshBooks | Smaller players, all MTD-listed. |

## Bridging software (the spreadsheet escape hatch)

If a business genuinely keeps records in a spreadsheet and doesn't want full accounting software, "bridging software" connects the spreadsheet to HMRC's API. The spreadsheet remains the digital record; the bridging tool just files the return.

Common bridging tools: VitalTax, Easy MTD VAT, 100PcVatFreeBridge, QuickFile, Tax Optimiser.

Bridging is legal and MTD-compliant. It's a sensible interim path for users who don't want to move to full accounting software immediately.

## What "digital links" means in practice

If a user pulls totals from their bank statement and types them into VAT-filing software, that's NOT MTD-compliant — the link between bank and filing is manual.

Acceptable digital links:
- API connections between two software systems.
- CSV export and import where formulas pull data through.
- Linked cells in spreadsheets.
- Email/upload of a digital file (no manual retyping).

Not acceptable:
- Reading a figure off a screen and typing it elsewhere.
- Printing and re-keying.

The rule is enforced loosely in practice but the user should know the principle. Soft enforcement has tightened year on year.

## Penalties for non-compliance

HMRC moved to a **points-based system** in January 2023. Each late return adds a point. Once a threshold is hit, a £200 penalty applies and persists until the user files a clean run.

| VAT frequency | Points threshold |
|---|---|
| Monthly | 5 points |
| Quarterly | 4 points |
| Annual | 2 points |

Late payment also incurs interest at HMRC's official rate (Bank of England base + 2.5% at time of writing — verify before quoting).

## Exemptions

A user can apply to be exempt from MTD if:
- Religious beliefs incompatible with using computers (Plymouth Brethren, etc.).
- Age, disability, or remote location makes it not "reasonably practicable" to use digital tools.
- Insolvency.

Apply by calling HMRC. Approval is not automatic — typical wait several weeks.

## MTD for Income Tax Self Assessment (MTD ITSA) — the next wave

| From | In scope |
|---|---|
| 6 April 2026 | Sole traders and landlords with combined business + property income over **£50,000** |
| 6 April 2027 | Threshold drops to **£30,000** |
| Later (not yet confirmed) | Threshold may drop to £20,000; partnerships likely to follow |

What it requires:
- Digital record-keeping (same as MTD VAT).
- **Quarterly updates** to HMRC summarising income and expenses by category.
- An **end-of-period statement** (EOPS) per business per year.
- A **final declaration** replacing the current Self Assessment return.

The rollout has been delayed multiple times. Always check the current gov.uk page before telling a user firm dates.

## What to ask the user

- Are they VAT-registered? (If yes — they're in MTD already.)
- What software do they use today? (Determines whether they're already compliant or need to switch.)
- For MTD ITSA-bound users: what's their combined business + property income? (Determines whether they need to prepare for 2026 or 2027 — or might fall below the threshold.)
- Have they ever applied for an exemption? (Rare but worth checking.)

## Common confusions to clear up

- "MTD only applies to large businesses" — false. Since April 2022 it applies to every VAT-registered business.
- "I can still file my return on the HMRC website" — only if you're not in MTD. VAT-registered users are.
- "Spreadsheets aren't allowed" — they ARE allowed, as long as they're combined with bridging software and digital links.
- "MTD ITSA is already in force" — not yet. April 2026 is the current start date, threshold £50k.

## Reference

- HMRC MTD overview: gov.uk/government/collections/making-tax-digital-for-vat
- Software list: gov.uk/guidance/find-software-thats-compatible-with-making-tax-digital-for-vat
- MTD ITSA guidance: gov.uk/guidance/check-if-youre-eligible-to-sign-up-for-making-tax-digital-for-income-tax

These are the authoritative sources. Refer the user there for the latest dates and approved software.
