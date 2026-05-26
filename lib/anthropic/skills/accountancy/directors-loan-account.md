---
name: directors-loan-account
description: Apply when the user takes money from their limited company that isn't salary or dividend, or pays personal expenses through the company. Covers the s.455 charge on overdrawn loans, BIK on interest-free loans over £10,000, the 9-month repayment rule, and how to avoid accidentally creating an overdrawn DLA.
tags: hmrc, ltd-company, director-loan, s455, bik
---

# Director's loan account (DLA) — UK rules

A director's loan account is the running record of all money flowing between a director and their limited company that isn't salary, dividend, or genuine business expense reimbursement. Most owner-managed Ltds have one — often without the director realising it.

## When a DLA gets "overdrawn"

The DLA is overdrawn when the director **owes the company** money — they've taken more out than they put in (and more than salary/dividends covered). This happens when:

- The director pays personal expenses on the company card without paying back.
- The director takes regular cash drawings before any formal dividend has been declared.
- The company pays for things on behalf of the director (a car, a holiday, school fees).
- An interim dividend was declared but the company didn't actually have distributable reserves (the "dividend" reclassifies as a loan).

When the DLA is in credit (director put money IN to the company), it's a creditor of the company — normal and tax-free.

When overdrawn, two tax charges can apply.

## The s.455 charge — 33.75% on outstanding loans

If the DLA is overdrawn at the **company's year-end AND still overdrawn 9 months later**, the company pays a **s.455 charge** at **33.75%** of the outstanding balance (matching the higher-rate dividend rate).

The charge is a temporary tax — refundable when the loan is repaid. But the company has to find the cash in the meantime and waits years (until 9 months after the year-end *in which* the loan is repaid) to claim the refund. Painful for cashflow.

Worked example. Year-end 31 March 2025. Director owes the company £30,000 at that date.
- If the director repays in full by 1 January 2026 (9 months after year-end): no s.455 charge.
- If still £30,000 outstanding at 1 January 2026: company owes s.455 of £30,000 × 33.75% = £10,125. Due to HMRC by 1 January 2026 (same date as CT for that year).
- The £10,125 is **refunded** once the loan is repaid — but only on the 9-months-and-1-day deadline *after* the year-end in which repayment happens.

## The 9-month repayment rule

Many owner-managers use the 9-month window strategically. The "bed and breakfast" rule used to allow repaying just before year-end and re-borrowing just after, but **HMRC closed that loophole** with anti-avoidance:

- Repay £15,000+ to clear the DLA, then re-borrow £5,000+ within 30 days → the repayment is **ignored** for s.455 purposes (s.464C ITA 2007).
- Repay £5,000+ when the loan was at least £15,000, and the director intended to re-borrow → s.455 still applies.

So the "repay before year-end" strategy only works if the director genuinely doesn't re-borrow within 30 days. Many users get caught.

## BIK on interest-free loans over £10,000

If the DLA balance exceeds £10,000 at any time during the year **and** the company charges no interest (or less than HMRC's official rate, currently around 2.25% but check):

- The director has a **benefit in kind** equal to the interest the company "should" have charged.
- Reported on form P11D.
- Income tax owed by the director at marginal rate.
- Class 1A NIC owed by the company at 13.8% on the BIK.

The £10,000 threshold is a **trigger**, not a deduction. If the loan ever crosses £10,000, BIK applies to the whole loan, not just the excess.

Workaround: charge the director the official rate of interest from day one. Avoids BIK. The interest paid is taxable income for the company but generally a small price compared with the BIK / NIC alternative.

## How to "clear" an overdrawn DLA

Three legitimate routes:

1. **Director repays in cash.** Cleanest. Just transfer money back to the company.
2. **Pay a dividend** (requires distributable reserves) and credit it against the DLA. Dividend taxed normally on the director.
3. **Pay a bonus** (taxed via PAYE) and credit it. Bonus is deductible for CT but generates employer NIC and full income tax + NIC on the director. Usually worse than a dividend.

Writing off the loan **without** any of the above is a fourth route but triggers full PAYE/NIC as if the loan were earnings — almost never tax-efficient.

## Common ways a DLA becomes overdrawn without the director noticing

- **Personal Amazon, Apple, or supermarket payments on the company card.** Each one without a clear business purpose pushes the DLA further negative.
- **The director's "weekly draw"** before a year-end dividend has been formally declared. Until the dividend exists, every withdrawal is a loan.
- **Holiday flights, hotels, restaurant bills** on the company card during a clearly personal trip.
- **School fees, gym memberships, personal subscriptions** paid by the company.
- **Loans to a director's spouse or other family member** — caught under s.460 if the company is "close" (most owner-managed companies are).

The agent should normalise calling these out when reviewing transactions. Each one is potentially a DLA debit. Not a problem if balanced by salary/dividend credits, but worth flagging.

## Loans to participators (the broader rule)

s.455 applies to loans to any "participator" of a close company, not just directors. A participator includes shareholders, holders of share options, anyone with rights to receive profits — and **associates** (spouse, civil partner, parents, children, siblings, business partners).

So a Ltd company loaning £20,000 to the founder's adult son triggers s.455 the same way as a loan to the founder. Easy to overlook.

## What the agent should ask

When a user mentions taking money from their company, paying personal expenses on the company card, or any phrase like "I owe my company":

1. What's the company's year-end?
2. What's the current DLA balance — overdrawn or in credit, and roughly by how much?
3. Has it been above £10,000 at any point this year? (Triggers BIK consideration.)
4. Has it been overdrawn at the **last** year-end? (Determines whether s.455 from a prior year is already due / paid / refundable.)
5. Does the company have distributable reserves to clear it via dividend?

That sequence covers the tax exposure.

## What goes through the accountant

DLA position at year-end should be a standing item in the accountancy agent's review. The agent can summarise the balance and flag what's needed, but the **actual clearance** (declaring a dividend, paying a bonus, organising the s.455 calculation) needs the accountant — partly for distributable reserves verification, partly because the formal book entries matter for the audit trail.

## Common errors to flag

- Spending on the company card without backing it out via dividend or bonus.
- Assuming "I'll just call it a dividend at year-end" — only works if reserves support it.
- Forgetting BIK above £10,000 even when balance has been "repaid" by year-end.
- Re-borrowing within 30 days of clearing the balance — caught by anti-avoidance.
- Failing to charge interest above £10,000 — creates BIK that's bigger than the interest would have been.
- Not realising loans to family members trigger s.455.

## Reference

- HMRC CTM61500 — s.455 detailed rules
- HMRC EIM26101 — interest-free loans BIK
- gov.uk/directors-loans
- s.455–s.464 Income Tax Act 2007 — close company loans to participators
