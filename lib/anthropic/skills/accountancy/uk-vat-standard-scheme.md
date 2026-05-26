---
name: uk-vat-standard-scheme
description: Apply when the user is on the standard (not flat-rate) VAT scheme or asks how VAT is calculated normally. Covers the 9-box VAT return, input vs output VAT, partial exemption basics, cash vs invoice accounting, and when to recommend each scheme.
tags: vat, hmrc, standard-scheme
---

# UK standard-rate VAT scheme — operating guide

The standard scheme is the default. Businesses charge output VAT on sales, reclaim input VAT on purchases, and pay HMRC the difference each quarter (or monthly / annually for some businesses).

## VAT rates

| Rate | Use |
|---|---|
| 20% | Standard rate — most goods and services |
| 5% | Reduced rate — domestic energy, child car seats, mobility aids for the elderly |
| 0% | Zero-rated — most food, children's clothing, books, public transport, exports |
| Exempt | No VAT — insurance, education, financial services, postage stamps, health services |

**Zero-rated vs exempt is critical.** Zero-rated sales count toward the VAT threshold and let you reclaim input VAT. Exempt sales do not — and force partial exemption calculations.

## The 9-box VAT return

| Box | What it reports |
|---|---|
| 1 | VAT due on sales (output VAT) |
| 2 | VAT due on EU acquisitions (rare since Brexit — usually £0 for GB businesses) |
| 3 | Total VAT due (Box 1 + Box 2) |
| 4 | VAT reclaimed on purchases (input VAT) |
| 5 | Net VAT to pay HMRC (Box 3 – Box 4). If negative, HMRC repays. |
| 6 | Total value of sales **ex VAT** |
| 7 | Total value of purchases **ex VAT** |
| 8 | Value of goods supplied to EU (post-Brexit, usually £0) |
| 9 | Value of goods acquired from EU |

Northern Ireland businesses still have Boxes 2, 8, 9 relevance for goods (the NI Protocol). GB businesses normally enter £0 in those boxes.

## Worked example

A consultancy quarter:
- Sales invoiced: £40,000 net + £8,000 VAT = £48,000 gross.
- Allowable purchases: laptops £2,000 net + £400 VAT, software subs £1,500 + £300 VAT, accountancy fees £500 + £100 VAT. Total input VAT £800.
- One staff meal £80 inc VAT (not reclaimable — entertainment).

Boxes:
- Box 1: £8,000
- Box 3: £8,000
- Box 4: £800
- Box 5: £7,200 to pay HMRC
- Box 6: £40,000
- Box 7: £4,000 (£2,000 + £1,500 + £500)

## When you CAN'T reclaim input VAT

- **Business entertainment** — staff entertaining within HMRC limits is OK; client entertainment is never reclaimable.
- **Cars** for mixed personal/business use (very narrow exceptions for pool cars meeting strict tests).
- **Goods or services used for exempt supplies** (forces partial exemption).
- **Purchases without a valid VAT invoice** — must show VAT number, date, supplier name, breakdown of VAT.

## Cash accounting vs invoice (accrual) accounting

| Cash accounting | Invoice accounting (default) |
|---|---|
| Account for VAT when paid/received | Account for VAT when invoice issued |
| Limited to turnover ≤ £1.35m | No turnover limit |
| Helps cashflow on late-paying customers | Standard for most businesses |
| Can't reclaim VAT on a purchase until paid | Reclaim as soon as invoice received |

Sole traders and small Ltds with late-paying clients benefit from cash accounting — they don't fund HMRC's VAT bill before the customer has paid them.

## Annual accounting scheme

Submit ONE return per year, pay HMRC in monthly or quarterly instalments based on prior-year estimate, true up at year-end. Available for turnover ≤ £1.35m. Reduces admin burden but rarely beats invoice accounting for cashflow.

## VAT registration thresholds

| Threshold | What it is |
|---|---|
| £90,000 | Mandatory registration — must register within 30 days of the month you exceed it |
| £88,000 | Deregistration threshold (when turnover falls below this for the foreseeable future) |

Thresholds change in spring budgets — verify before quoting. Voluntary registration below the threshold is possible and sometimes worthwhile if most sales are zero-rated (food, books) — gets you input VAT back.

## Partial exemption (when some sales are VAT-exempt)

If a business makes both taxable and exempt supplies (e.g. an estate agent who also does insurance broking), only the input VAT proportionally attributable to taxable supplies is reclaimable. Methods:

- **Standard method**: split input VAT by ratio of taxable turnover to total turnover. Apportion VAT on overheads.
- **De minimis test**: if exempt input VAT is under £625/month average AND under 50% of total input VAT, reclaim everything.

This gets complicated fast. When a user mentions exempt sales, ask whether their accountant has set up a partial exemption method and refer there rather than calculating it yourself.

## When to recommend changing schemes

| User situation | Recommend |
|---|---|
| Late-paying clients, turnover ≤ £1.35m | Cash accounting |
| Wants single annual return | Annual accounting |
| Very low input costs, professional services, turnover < £150k | Consider flat-rate (test LCT rule first) |
| Most sales zero-rated, regular input VAT | Voluntary registration |
| Mostly exempt supplies | Stay unregistered — registration would force partial exemption complexity |

## Common errors to flag

- Reclaiming input VAT on client entertainment.
- Missing the registration deadline once turnover crosses the threshold.
- Not having a valid VAT invoice for a reclaim (especially on petty cash receipts).
- Forgetting to charge VAT on services exported to non-EU countries (usually zero-rated — but rules differ for digital services under VAT MOSS / OSS).
- Treating exempt sales as zero-rated (they're different — see above).
- Not applying the reverse charge for B2B services received from outside the UK.

## Reference

- HMRC VAT Notice 700 — the general VAT guide
- HMRC VAT Notice 700/12 — filling in your VAT return
- HMRC VAT Notice 706 — partial exemption

Refer the user to these for edge cases and recommend their accountant confirm before any return is submitted.
