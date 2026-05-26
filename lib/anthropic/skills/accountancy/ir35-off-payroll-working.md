---
name: ir35-off-payroll-working
description: Apply when the user works through a personal service company (PSC) for clients, or is a client engaging contractors. Covers IR35 status tests, the post-April-2021 off-payroll working rules, who's responsible for the determination, the Status Determination Statement (SDS), and small-client exemption.
tags: hmrc, ir35, off-payroll-working, contractor, psc
---

# IR35 / off-payroll working rules — UK guide

IR35 is HMRC's attempt to catch "disguised employment" — situations where a worker uses a limited company (a personal service company, PSC) to provide services to a client when, but for the company, they'd be an employee. If caught, the income is taxed as employment income (with full PAYE and NIC) rather than corporate income with dividends.

## Two regimes (don't mix them up)

There are two versions of IR35 running in parallel, depending on the **client's** size:

### Off-payroll working (the post-2021 regime — applies to most engagements)

If the **client** is a medium or large business, **the client decides** whether IR35 applies and is responsible for the PAYE/NIC if it does.

This applies if the client meets at least two of:
- Annual turnover over £10.2m
- Balance sheet total over £5.1m
- More than 50 employees

Plus all public-sector clients (regardless of size) since 2017.

The client must produce a **Status Determination Statement** (SDS) for each engagement, share it with the worker AND any intermediary (the agency), and have a process for the worker to dispute it.

### The original "Chapter 8" IR35 (still applies for engagements with small clients)

If the client is a **small** business (doesn't meet the size criteria above), the **PSC itself** decides IR35 status and is responsible for any tax due if caught.

This is the older regime. Most owner-managed Ltd contractors working for SMEs fall here. They're on their own to assess each contract.

## The status tests — when is someone "inside IR35"?

There's no single test. HMRC and the courts weigh several factors. The three most important:

### 1. Personal service / right of substitution

Can the worker send a substitute to do the work in their place?
- A **genuine, unfettered right** of substitution — strongly outside IR35.
- A right to substitute "with the client's reasonable approval" — neutral, depends on practice.
- No right to substitute or the right is purely theoretical — points toward inside.

If the contract names the worker and won't accept substitutes, and in practice substitution has never happened, this factor pulls strongly inside.

### 2. Control

Who controls how, when, where, and what work is done?
- Worker controls all four (genuinely deciding their own approach, hours, location, scope) — outside.
- Client controls all four (you turn up at 9, you sit at this desk, you do exactly what they say) — inside.
- Most real engagements sit in the middle. Control over **how** (method) matters most for outside status; control over **what** (deliverable) is normal for any contractor.

### 3. Mutuality of obligation (MOO)

Is the client obliged to provide work, and is the worker obliged to accept it?
- One-off project with a defined deliverable, no ongoing obligation — outside.
- Rolling engagement where the client expects the worker to be available and the worker has to accept work — inside.
- HMRC argues MOO exists in any paid contract; tribunals usually disagree at the threshold of "is there an employment-like ongoing obligation."

### Secondary factors

These add weight:
- **Financial risk**: own kit, fixed-price quotes, having to fix bad work at own expense — outside.
- **Part and parcel**: does the worker appear on the client's org chart, attend internal meetings as a staff member, get training and perks — inside.
- **Equipment**: providing own laptop, software, tools — outside. Using client kit — inside.
- **Length of engagement**: years on a single client — inside indicator (not determinative).
- **Multiple clients**: working for several clients in parallel — outside indicator.
- **Right to provide services to others**: contract allows working for other clients during the engagement — outside.

## The CEST tool

HMRC's "Check Employment Status for Tax" tool at gov.uk/check-employment-status. The result is binding on HMRC **if** the inputs were honest and complete. Many engagements are determined this way.

Limitations: CEST historically struggles with mutuality of obligation (it doesn't really test it) and substitution (it can be over-influenced by an unrealistic theoretical right). For finely balanced cases, get a specialist review rather than relying on CEST alone.

## What happens when an engagement is "inside IR35"

### Under off-payroll working (client responsible):
- The fee-payer (client or agency) treats the PSC's invoice as deemed employment income.
- Operates PAYE and Class 1 NIC on the gross amount.
- Pays the worker's PSC the net amount.
- The PSC receives net cash with the PAYE/NIC already accounted for.

The PSC then needs to extract that cash to the worker without taxing it again. There are mechanisms (the "deemed payment" pathway) — recommend the worker's accountant handle this.

### Under Chapter 8 (PSC responsible):
- PSC calculates a "deemed employment payment" at year-end.
- Operates PAYE/NIC on that amount.
- The worker effectively loses most of the tax efficiency of being a PSC.

## Small-client exemption — important for SME contractors

If the **client is a small business**, off-payroll rules do not apply. The PSC self-assesses under Chapter 8. Many small Ltd contractors working for other SMEs fall here.

But: the contractor must still genuinely be outside IR35 by the tests above. "My client is small so I don't need to worry about IR35" is wrong — they're still subject to Chapter 8 self-assessment.

## When to seek specialist advice

- The contract value is over £100k/year — the tax at stake is material.
- The engagement has lasted more than 18 months with one client.
- The contract was drafted by the client's procurement team (often pro-client / inside-IR35 language).
- The contractor has been audited or received a status determination they disagree with.

Don't try to definitively determine IR35 status from a user prompt. Identify the relevant factors, explain what would lean each way, and recommend a specialist (e.g. Qdos, IPSE-recommended advisors) for anything material.

## What the agent should ask

When a contractor mentions IR35 or asks about contract status:
1. What's the client's size? (Determines which regime applies.)
2. Has the client provided an SDS? (If yes, has the contractor disputed it?)
3. Briefly — what's the engagement? Project-based or rolling?
4. Right of substitution — yes, with approval, or no?
5. Equipment — own or client's?
6. Could the contractor work for other clients during the engagement?

Those answers map to the factors and let the agent name what's pulling inside vs outside without making a final call.

## Common misconceptions to clear up

- "I can be inside IR35 for one contract and outside for another" — yes. Status is per-contract, not per-person.
- "I have a Ltd company so I'm definitely outside IR35" — false. The Ltd is necessary but not sufficient.
- "I work from home, so I must be outside" — irrelevant; location is one factor among many.
- "The agency told me I'm outside, so I'm safe" — under off-payroll working it's the client (not the agency) who decides.
- "I can use a brolly to avoid IR35" — umbrella companies are a separate route; they sidestep IR35 entirely by employing the worker on PAYE.

## Reference

- HMRC ESM (Employment Status Manual) — esm0500 onward
- gov.uk/guidance/understanding-off-payroll-working-ir35
- CEST tool: gov.uk/guidance/check-employment-status-for-tax
- The "control / substitution / MOO" framework comes from *Ready Mixed Concrete v MPNI* (1968) and has been refined through subsequent case law (Atholl House, Kickabout, Hall v Lorimer).
