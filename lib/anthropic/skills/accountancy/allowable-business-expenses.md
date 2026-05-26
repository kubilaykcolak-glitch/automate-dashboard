---
name: allowable-business-expenses
description: Apply when the user asks whether an expense is tax-deductible, what counts as an allowable business expense, or wants help categorising expenses. Covers HMRC's "wholly and exclusively" test, common categories, mixed-use rules, and items that are never deductible.
tags: hmrc, expenses, deductibility, sole-trader, ltd-company
---

# UK allowable business expenses — categorisation guide

The core rule from HMRC: an expense is allowable for tax purposes if it is incurred **wholly and exclusively** for the purposes of the trade. That phrase does a lot of work. This guide breaks down what passes the test, what doesn't, and the awkward middle cases.

## The "wholly and exclusively" test

For sole traders this is in s.34 ITTOIA 2005. For companies, s.54 CTA 2009. Same principle.

- If an expense has both a business and a personal purpose, it can still be deductible if the personal benefit is **incidental**. A meal with a client during travel is allowable (business purpose primary, eating is incidental). A meal with a friend you happen to mention work to is not.
- If an expense has a **dual purpose** at the outset (you'd have spent it anyway for personal reasons), it fails the test and is fully disallowed — even the business portion. Common example: ordinary work clothes that are also fit for everyday wear.
- An expense that's split predictably between business and personal use (e.g. a phone bill, electricity) can be **apportioned** with a sensible method. Apportionment is fine; mixed-purpose is not.

## Allowable categories (typical sole trader)

Use these as default categorisation buckets:

| Category | Examples | Notes |
|---|---|---|
| **Office costs** | Rent, rates, utilities at a dedicated office, stationery, postage, software subs | Home-office is separate — see `use-of-home-allowance` skill |
| **Travel** | Train, bus, taxi, parking, congestion charge, hotel for overnight business trips | Commute from home to a regular workplace is NOT allowable |
| **Subsistence** | Reasonable food and drink during overnight business trips, or away from a normal workplace | Daily lunch is not allowable — that's part of ordinary living costs |
| **Vehicle costs** | See `mileage-and-vehicle-expenses` skill | |
| **Stock / cost of sales** | Goods bought for resale, raw materials, packaging | |
| **Salaries / contractors** | Wages, employer NIC, pension contributions, contractor fees | |
| **Professional fees** | Accountant, legal, business consultancy, insurance | One-off legal costs of acquiring a capital asset go on cost of asset, not P&L |
| **Marketing** | Advertising, website hosting, business cards, sponsored content, branded goods given away | Branded promotional items costing ≤£50/recipient/year are allowable; gifts of food/drink/tobacco never |
| **Equipment** | Laptops, phones, tools, small machinery | Items under £150 typically expensed; larger items go through capital allowances (AIA covers most) |
| **Training** | Updating existing skills | New skills entering new trade are not allowable (HMRC view: capital nature) |
| **Bank charges** | Business account fees, payment processor fees (Stripe, PayPal), interest on business loans | |
| **Use of home** | Apportioned utilities, council tax, etc. | See dedicated skill |
| **Repairs and maintenance** | Restoring an asset to working condition | Improvements/upgrades are capital, not expense |
| **Bad debts** | Provisions for invoices unlikely to be paid | Sole traders only on accrual basis; cash-basis traders don't need this |

## Never allowable

- **Personal expenses** of the owner or family.
- **Drawings** (cash withdrawn by the sole trader — that's a transfer, not an expense).
- **Client entertainment** — for sole traders OR companies, entertaining clients/prospects is NEVER deductible for tax (even though it's a real business cost). The receipts go in the books for accounts purposes but get added back for tax.
- **Staff entertainment over £150/head/year** — under £150/head, allowable (annual party). Over: fully disallowed.
- **Fines and penalties** — speeding tickets, parking fines, late filing penalties. Not deductible.
- **Bribes and illegal payments.**
- **Political donations.**
- **Capital purchases through revenue** — a new van is a capital asset, not a one-off expense. Goes through capital allowances (typically 100% AIA).
- **Ordinary clothing** — suits, regular shoes, business attire. Only safety/uniform/branded workwear is allowable.
- **Travel between home and a regular place of work** (the daily commute).

## Mixed-use items — how to apportion

When something is used for both business and personal life, apportion by usage.

- **Mobile phone**: estimate business use as a fraction of total (e.g. 60% business → claim 60% of the bill). Need a defensible basis — keep a sample-month call/data log if HMRC ever asks.
- **Home broadband**: same logic. Standalone business broadband is 100%.
- **Vehicle**: see the mileage skill — either log business miles or apportion actual costs by business mile share.
- **Electricity at home for home-office use**: covered by the use-of-home skill.

The rule: keep a contemporaneous record of how you arrived at the percentage. "Around half" doesn't survive an enquiry; "60% based on a four-week log in March" does.

## The "duality of purpose" trap

The classic case: a barrister buying a black skirt and white shirt for court. HMRC's position (confirmed in *Mallalieu v Drummond*) was that the clothing also provides warmth and decency — a dual purpose at the moment of purchase — so the expense fails wholly-and-exclusively even though she'd never have worn the formal outfit privately. **Not allowable.**

This catches:
- Most "smart" clothing for a professional, even if only worn for work.
- A gym membership unless you're a personal trainer/athlete.
- Coffee shop or co-working day passes claimed as office costs when no specific business meeting was held there (HMRC view: the user also got food/drink/relaxation).

## What the agent should do when categorising

When the user uploads a transaction list or asks "is this deductible?", the agent should:

1. **State the category** confidently when the answer is clear (e.g. "Software subscription — allowable, Office costs").
2. **Apportion** when the expense is mixed-use, naming the method (e.g. "Phone bill — apportion by business use percentage. If you use it 70% for business, claim 70%.").
3. **Flag clearly** when an item is not deductible (e.g. "Client lunch — disallowable for tax; add back in the tax computation. Still record it in your books.").
4. **Ask one question** when the answer truly depends on a fact not provided (e.g. "Was this an overnight trip or a day visit? Subsistence rules differ.").

Never invent the deductibility — when in doubt, name the principle that decides it and ask the question that closes the gap.

## Reference

- HMRC BIM47000 series — Business Income Manual on specific expense types
- HMRC HS222 — How to calculate your taxable profits

For anything material, recommend the user's accountant confirm — particularly around capital vs revenue judgments, training new skills vs updating existing, and mixed-use apportionment percentages.
