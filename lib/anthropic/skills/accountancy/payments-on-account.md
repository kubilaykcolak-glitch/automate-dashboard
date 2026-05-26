---
name: payments-on-account
description: Apply when the user asks about Self Assessment payments on account (POA) — what they are, when they're due, how the calculation works, how to reduce them, and what happens if you over-reduce. Covers the common confusion that "I just paid my tax bill, what's this extra payment for?"
tags: hmrc, self-assessment, payments-on-account, deadlines
---

# Payments on account — UK Self Assessment

Payments on account are advance instalments toward next year's tax bill. They catch users by surprise because the system effectively asks for 150% of the current year's tax in the same January payment.

## When they apply

A user has to make POAs if **both**:
1. Last year's tax bill was over £1,000 (income tax + Class 4 NIC, NOT including Class 2 NIC or CGT).
2. Less than 80% of their tax was collected at source (e.g. through PAYE).

Most self-employed people meet both conditions and are caught by the POA system.

## How they're calculated

Each POA is **half** of the prior year's tax bill. There are two POAs per tax year:

| Due date | What it is |
|---|---|
| 31 January (during the tax year) | First POA |
| 31 July (after the end of the tax year) | Second POA |

## The big January bill explained

The 31 January deadline is famous because three payments fall on the same day:

1. **Balancing payment** for the tax year just ended.
2. **First POA** for the current tax year.
3. (Implicitly the late-payment penalty trigger if you miss it.)

Worked example for a user with a 2024/25 tax bill of £8,000 and a 2023/24 bill of £6,000:

| Date | Payment | Why |
|---|---|---|
| 31 Jan 2025 | £3,000 | First POA for 2024/25 (half of 2023/24 bill) |
| 31 Jul 2025 | £3,000 | Second POA for 2024/25 (other half) |
| 31 Jan 2026 | £2,000 + £4,000 = £6,000 | 2024/25 balancing payment (£8,000 actual – £6,000 POAs paid) + first POA for 2025/26 (half of £8,000) |
| 31 Jul 2026 | £4,000 | Second POA for 2025/26 |

That £6,000 in January 2026 is the moment users panic — "I thought I paid my tax in July."

## When the user expects a smaller bill — claim to reduce

If the user knows next year's profit will be lower, they can apply to reduce their POAs:

- Online through the Personal Tax Account at gov.uk/pay-self-assessment-tax-bill, or
- By submitting form SA303.

**Be careful**: if they reduce POAs and the actual liability turns out to be higher, HMRC charges interest on the underpaid amount from the original due date. Better to slightly under-reduce and overpay than aggressively reduce and owe interest.

When the user expects a substantially smaller bill (e.g. they've stopped trading, taken a salary job, had a big drop in turnover), reducing POAs is sensible. When it's a marginal expectation, leave them alone.

## When the user expects a bigger bill

POAs don't go up just because next year will be bigger — they're based on **prior year**. The user will face a bigger balancing payment the following January.

Worth flagging this proactively if you can see, in the data the user shared, that their current year is materially up. Otherwise it's a January-2026 nasty surprise.

## What POAs don't include

- **Class 2 NIC** — paid as a single £179.40 (2024/25) annual amount with the balancing payment, not part of POAs.
- **Capital Gains Tax** — separate; paid with the balancing payment.
- **Student loan repayments** — paid with the balancing payment.

So even when POAs match expected income-tax liability perfectly, the January 2026 balancing payment will be at least Class 2 NIC + any CGT + any student loan.

## When POAs disappear

The user stops being subject to POAs once:
- A future tax year's bill drops below £1,000 (no POA owed for the year after), or
- More than 80% of their tax is collected at source (e.g. they take a salaried job and pay through PAYE for most of their income).

## Interest and penalties on missed POAs

- Late payment of a POA: interest accrues from the original due date at HMRC's official rate (Bank of England base + 2.5% currently — verify).
- **No 30-day / 5%-of-tax penalty on missed POAs** — the late payment penalty regime only applies to the balancing payment, not POAs. Just interest.

This is a small comfort to flag — missing a POA isn't catastrophic, but the interest does add up.

## Tax payments other than POA

If a user asks about "what do I owe HMRC in January?" they may also be thinking about:
- VAT (separate, quarterly via MTD)
- PAYE/NIC if they have employees (monthly)
- Corporation tax (separate — 9 months after company year-end, no POA system but large companies have quarterly instalments)

Don't conflate these in a calculation.

## What the agent should ask

When a user asks about POA or "what should I pay in January?":
1. What's their last completed Self Assessment year, and what was the tax bill?
2. Are they expecting this year's profit to be similar, higher, or lower?
3. Do they have any PAYE income from a salaried job in the year?
4. Have they already paid any POAs?

That sequence gives you everything you need to compute the January and July figures.

## Common confusions to clear up

- "I paid my tax bill, why is HMRC asking for more?" → Explain that the January payment is balancing + advance.
- "I'm being charged tax I haven't earned yet" → Technically true; POAs are advance instalments. They balance up when the actual return is filed.
- "I reduced my POA to zero, should be fine" → Only if profit truly is much lower. Otherwise expect interest.
- "I'm in PAYE now, do I still owe POAs?" → If self-employment income is now minimal, possibly not — but the system doesn't auto-cancel; the user needs to claim to reduce or wait until next year's return shows the change.

## Reference

- HMRC SAM1090 — Self Assessment manual on payments on account
- gov.uk/understand-self-assessment-bill/payments-on-account
