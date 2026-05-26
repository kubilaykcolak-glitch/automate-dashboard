---
name: dividend-taxation
description: Apply when the user asks about taking money out of a limited company as dividends — the dividend allowance, dividend tax rates by band, how to calculate optimal salary-vs-dividend split for a director-shareholder, and when paying dividends is illegal (insufficient distributable reserves).
tags: hmrc, dividend, limited-company, director-shareholder, tax-planning
---

# UK dividend taxation — director-shareholder guide

Dividends are the primary way owner-managed limited company directors take money out tax-efficiently. The rules below apply to dividends paid by UK Ltd companies to UK-resident individual shareholders.

## The structure (director-shareholder of an owner-managed Ltd)

A typical setup:
- Director draws a small salary (often at the NIC secondary threshold so no employer NIC, but high enough to count for State Pension).
- The rest comes out as dividends from post-corporation-tax profit.
- Dividends are taxed in the individual's hands at dividend rates (lower than ordinary income rates), with an annual £500 dividend allowance.

## Dividend tax rates (2024/25)

Dividends use a separate set of rates from earned income:

| Band | Dividend rate |
|---|---|
| Dividend allowance — first £500 of dividends | 0% |
| Within basic rate band (taxable income up to £37,700 after personal allowance) | 8.75% |
| Within higher rate band (£37,701 – £125,140) | 33.75% |
| Within additional rate band (over £125,140) | 39.35% |

**Dividends use up the income tax bands**. That means salary first, then dividends. A user with £20,000 salary + £40,000 dividends fills their personal allowance and most of the basic rate band with the salary, with dividends spilling into higher rate.

The £500 allowance has been falling — was £2,000 in 2022/23, £1,000 in 2023/24, £500 in 2024/25. Worth confirming current year before quoting.

## Worked example — typical owner-manager

Director takes:
- £12,570 salary (matches the personal allowance — uses it up, no income tax)
- £40,000 dividends from their company

Tax calculation:
- Salary: £12,570 covered by personal allowance — £0 income tax.
- Dividend allowance: first £500 of dividends — £0 tax.
- Remaining dividends to consider: £39,500.
- Basic rate band capacity remaining: £37,700 - £0 (salary above PA) = £37,700.
- Of the £39,500 dividends: £37,700 falls in basic rate → £37,700 × 8.75% = £3,298.75.
- Remaining £1,800 falls into higher rate → £1,800 × 33.75% = £607.50.
- **Total dividend tax: £3,906.25**.

The director takes home £52,570 - £3,906 = £48,664 net.

(NB: this ignores NIC on salary if any; at £12,570 salary in 2024/25 there is no employee NIC because the primary threshold matches the PA.)

## Salary vs dividend split — the optimisation

The standard owner-manager strategy:

1. **Set salary at the NIC secondary threshold** (currently £9,100 / year — but with Employment Allowance for companies with multiple employees, often pushed to £12,570 to use the full PA). Below the secondary threshold, no employer NIC. Above, employer NIC at 13.8%.
2. **Top up with dividends** from post-CT profit.

Why this works:
- Salary is deductible for corporation tax (reduces the 19-25% CT bill).
- Dividends are NOT deductible — paid from post-tax profit.
- But dividends face lower personal tax rates AND zero NIC.
- The combination usually beats taking it all as salary.

Optimisation depends on:
- Whether the company can claim Employment Allowance (worth £5,000 of employer NIC).
- The director's other income (PAYE income from another job, rental, etc.).
- Corporation tax band (small profits 19% vs main 25%, with marginal relief).

Don't reach for a simple "salary of £X, dividends of £Y" rule — compute it. The current-year tax bands change yearly.

## Distributable reserves — when dividends are ILLEGAL

A company can only pay a dividend out of "distributable reserves" — broadly, accumulated realised profits minus accumulated realised losses, after corporation tax. Paying a dividend without distributable reserves is an **unlawful distribution**.

Consequences:
- The director receiving the dividend can be required to repay it under s.847 CA 2006 if they knew or had reasonable grounds to suspect.
- HMRC may reclassify the unlawful dividend as a director's loan, which has nasty tax consequences (s.455 charge at 33.75% if not repaid within 9 months of year-end, plus BIK on the implicit interest-free loan).

**Always check the company has the reserves before declaring a dividend.** This needs to be done at the date of declaration, not at year-end. For interim dividends, the directors should sign off interim accounts showing the reserves exist.

When a user mentions taking a dividend, ask: "Has the company made enough profit this year, after corporation tax, to cover the dividend?" If they don't know, ask whether they have draft accounts.

## Dividend tax via Self Assessment

Dividend tax is paid through Self Assessment, not at source. The dividend is paid gross by the company (no withholding). The director:
- Declares the dividend on their personal SA return.
- The 8.75% / 33.75% / 39.35% tax is calculated and paid as part of the SA balancing payment / POAs.

This means the cash arrives in the director's bank account at the gross amount, but they need to set aside tax for January's bill. **Common cashflow trap** — spend the gross, get a tax bill they can't pay.

A rough rule for higher-rate dividend recipients: set aside 35% of every dividend payment into a separate savings account for tax. For basic-rate, 10%.

## High-income child benefit charge

Dividend income is included in "adjusted net income" for the High Income Child Benefit Charge. A director-shareholder taking large dividends triggers HICBC tapering between £60,000 and £80,000 (2024/25 thresholds). Worth flagging when relevant — easy to overlook.

## Other things to know

- **Dividend waivers** by one shareholder to benefit another are heavily scrutinised by HMRC under the settlements legislation (especially spouses). Genuine commercial waivers are fine; tax-driven ones get challenged.
- **Alphabet shares** — different share classes paying different dividends — can be useful but again face anti-avoidance scrutiny if used purely to shift income to a lower-rate spouse.
- **Pre-2016 changes**: prior to April 2016, dividends had a tax credit system. Don't apply old logic to current rates.

## What the agent should ask before computing

1. What's the director's total expected income for the year — salary, dividends, any other source?
2. Are they the only shareholder, or are there others (e.g. spouse with their own personal allowance)?
3. Has the company verified it has distributable reserves?
4. Are they currently in PAYE elsewhere?

The last question is critical — a director with a £60k PAYE salary alongside dividends pays a very different rate than a director with only dividends.

## Reference

- HMRC HS300 — Non-resident shareholders and dividend taxation
- gov.uk/tax-on-dividends
- Companies Act 2006 ss.829-853 — distributions to members
