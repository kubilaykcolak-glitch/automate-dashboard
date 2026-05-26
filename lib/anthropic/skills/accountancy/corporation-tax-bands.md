---
name: corporation-tax-bands
description: Apply when the user asks about UK corporation tax — current rates, the small profits rate vs main rate, marginal relief between £50k and £250k profit, how associated companies affect the bands, payment dates, and quarterly instalments for large companies.
tags: hmrc, corporation-tax, limited-company, marginal-relief
---

# UK corporation tax — bands and payment rules

The headline corporation tax (CT) rate changed in April 2023 from a flat 19% to a tiered system. The full rules are awkward — particularly marginal relief and the effect of associated companies.

## Rates (financial year 2024 onwards — verify before quoting)

| Profit | Rate |
|---|---|
| £0 – £50,000 | **Small profits rate: 19%** |
| £50,000 – £250,000 | **Marginal relief** applies — effective rate gradually rises from 19% to 25% |
| Over £250,000 | **Main rate: 25%** on all profit |

The thresholds (£50k and £250k) are pro-rated for accounting periods shorter than 12 months and divided by the number of "associated companies" (see below).

A company's "financial year" for CT runs **1 April to 31 March**. If a company's accounting year straddles a rate change, profit is apportioned by days into each financial year.

## Marginal relief — the calculation

For profit between £50k and £250k, the company pays the main rate (25%) and then deducts marginal relief.

```
Marginal relief = (Upper limit - Augmented profit) × (Standard fraction) × (Taxable profit / Augmented profit)
```

Where:
- **Upper limit**: £250,000 (with adjustments — see below)
- **Augmented profit**: taxable profit + non-group exempt dividends received
- **Standard fraction**: 3/200 for FY2024 (subject to change)

Worked example — company with £150,000 taxable profit, no other income, no associated companies:
- CT at main rate: £150,000 × 25% = £37,500
- Marginal relief: (£250,000 – £150,000) × 3/200 = £1,500
- Net CT: £37,500 – £1,500 = £36,000
- Effective rate: 24%

At £50k profit: 19% (no marginal relief needed because at the lower limit).
At £250k profit: 25% (full main rate; marginal relief calculation gives zero).
Between: gradient from 19% to 25%.

## Associated companies — the critical wrinkle

The £50k and £250k thresholds are divided by the number of **associated companies** in the period. Two companies are associated if one controls the other, or both are under common control by the same person(s).

So if a person owns three trading companies (or one trading company + two property-holding companies they also control), each company's lower limit is £50,000 / 3 = £16,667, and upper limit is £250,000 / 3 = £83,333.

This catches a lot of owner-managed business families and was a major change from the pre-2023 single-rate system.

**Dormant** companies don't count, nor do passive holding companies meeting strict criteria.

Always ask: "Do you own any other companies, even dormant or property-holding ones?" — most users don't proactively mention them.

## Quarterly instalments (large companies)

Companies with **taxable profit over £1.5m** (with the threshold divided by associated companies + 1) must pay CT in **quarterly instalments** instead of the standard 9-months-and-1-day rule.

For a company with a 31 March year-end, instalments fall on:
- 14 October (during the year — months 6+13)
- 14 January (year months 9+16)
- 14 April (year months 12+19, i.e. just after year-end)
- 14 July (months 15+22, i.e. 3 months after year-end)

A "very large" company (profit over £20m) has accelerated instalments — months 3, 6, 9, 12 of the accounting period.

Most owner-managed Ltds are well below this — they pay CT 9 months + 1 day after year-end as a single payment.

## Standard payment date (under £1.5m profit)

CT is due **9 months and 1 day** after the end of the accounting period.

- Year-end 31 March 2025 → CT due 1 January 2026.
- Year-end 31 December 2024 → CT due 1 October 2025.

The return (CT600) itself is due 12 months after year-end — but the cash has to leave 3 months earlier. Don't confuse the two dates.

## Filing requirements

- **CT600** corporation tax return: 12 months after year-end.
- Plus accounts in iXBRL format (the standard format for both Companies House and HMRC).
- Plus tax computation as a separate iXBRL document.

Penalty for late filing: £100 immediately, more after 3 months, more again after 6 and 12 months. **Interest** runs on unpaid CT from day one of the due date.

## R&D tax relief — quick mention

If the company carries out qualifying R&D, there's a separate relief regime (now merged scheme as of April 2024) that gives an enhanced deduction or a payable credit. Common but underclaimed by small companies. If a user mentions developing software, novel processes, or scientific work, ask whether they've claimed R&D relief.

(Specific R&D rules are complex enough to deserve their own skill once the library expands.)

## What the agent should ask

When a user asks about CT or company tax:
1. What's the company's year-end?
2. What's the expected profit for the current year?
3. Are there any **other companies under common control** (associated)?
4. What's the company's actual filing year? (CT financial year ≠ calendar year ≠ accounting year — be precise.)

The third question is the one users most commonly overlook and the one that most changes the answer.

## Common errors to flag

- Applying the small profits rate at full effect on profits above £50k — forgetting marginal relief.
- Forgetting to divide the limits by associated companies.
- Mixing up the CT600 deadline (12 months) with the CT payment deadline (9 months + 1 day).
- Treating dividends from group companies as "augmented profit" for marginal relief when group exemption applies.
- Assuming the financial-year-rate apportionment isn't needed for a non-March year-end (it is).

## Reference

- HMRC CT Manual CTM03900 series — marginal relief calculation
- HMRC CTM03700 — associated companies
- gov.uk/corporation-tax-rates
- Tax Faculty (ICAEW) commentary on associated companies — particularly useful for edge cases

For any company close to the £50k or £250k thresholds, or with multiple owner-controlled entities, recommend the accountant model the year-end position before March to plan timing of dividends, salaries, and any deferrable expenses.
