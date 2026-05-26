import type { AgentConfig, AgentProfileSchema } from "./types";

const ACCOUNTANCY_PROFILE_SCHEMA: AgentProfileSchema = {
  steps: [
    {
      title: "Business basics",
      description:
        "Tell us about your business so the agent can give accurate, UK-aware answers.",
      fields: [
        {
          key: "businessName",
          label: "Business name",
          type: "text",
          placeholder: "e.g. Acme Consulting Ltd",
          required: true,
        },
        {
          key: "businessType",
          label: "Business type",
          type: "select",
          required: true,
          options: [
            { value: "sole_trader", label: "Sole trader" },
            { value: "limited_company", label: "Limited company" },
            { value: "partnership", label: "Partnership" },
          ],
        },
        {
          key: "country",
          label: "Country",
          type: "select",
          required: true,
          defaultValue: "uk",
          options: [{ value: "uk", label: "United Kingdom" }],
          helpText: "Only UK is supported for now — HMRC tax rules apply.",
        },
        {
          key: "tradingStartDate",
          label: "Trading start date",
          type: "date",
          helpText: "Optional. Helps with first-year tax calculations.",
        },
        {
          key: "companyNumber",
          label: "Companies House number",
          type: "text",
          placeholder: "e.g. 12345678",
          showIf: { field: "businessType", equals: "limited_company" },
          helpText: "8-digit registration number from Companies House.",
        },
        {
          key: "utr",
          label: "UTR (Unique Taxpayer Reference)",
          type: "text",
          placeholder: "10-digit number from HMRC, e.g. 1234567890",
          helpText:
            "Optional. Required for self-assessment filings — useful for the agent to reference.",
        },
        {
          key: "bookkeepingSoftware",
          label: "Bookkeeping software",
          type: "select",
          required: true,
          defaultValue: "spreadsheets",
          options: [
            { value: "xero", label: "Xero" },
            { value: "quickbooks", label: "QuickBooks" },
            { value: "freeagent", label: "FreeAgent" },
            { value: "sage", label: "Sage" },
            { value: "wave", label: "Wave" },
            { value: "spreadsheets", label: "Spreadsheets / Excel" },
            { value: "paper", label: "Paper records" },
            { value: "none", label: "Nothing yet" },
          ],
          helpText:
            "Tells the agent what data format to expect when you share statements.",
        },
      ],
    },
    {
      title: "Tax setup",
      description: "How your accounting is structured.",
      fields: [
        {
          key: "taxYearStart",
          label: "Tax year start",
          type: "select",
          required: true,
          defaultValue: "6_april",
          options: [
            { value: "6_april", label: "6 April (UK individual / sole trader)" },
            { value: "1_january", label: "1 January (calendar year)" },
            { value: "custom", label: "Custom (Ltd company year-end)" },
          ],
        },
        {
          key: "taxYearCustom",
          label: "Custom year-end date",
          type: "date",
          placeholder: "Pick the last day of your accounting year",
          showIf: { field: "taxYearStart", equals: "custom" },
        },
        {
          key: "vatRegistered",
          label: "VAT registered",
          type: "boolean",
          required: true,
        },
        {
          key: "vatNumber",
          label: "VAT registration number",
          type: "text",
          required: true,
          placeholder: "e.g. GB123456789",
          showIf: { field: "vatRegistered", equals: true },
          helpText: "9 digits, usually prefixed with GB.",
        },
        {
          key: "vatScheme",
          label: "VAT scheme",
          type: "select",
          required: true,
          showIf: { field: "vatRegistered", equals: true },
          options: [
            { value: "standard", label: "Standard" },
            { value: "flat_rate", label: "Flat-rate" },
            { value: "cash", label: "Cash accounting" },
            { value: "annual_accounting", label: "Annual accounting" },
          ],
        },
        {
          key: "vatReturnFrequency",
          label: "VAT return frequency",
          type: "select",
          required: true,
          defaultValue: "quarterly",
          showIf: { field: "vatRegistered", equals: true },
          options: [
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly (most common)" },
            { value: "annual", label: "Annual" },
          ],
        },
        {
          key: "accountingBasis",
          label: "Accounting basis",
          type: "select",
          required: true,
          defaultValue: "cash",
          options: [
            { value: "cash", label: "Cash basis" },
            { value: "accrual", label: "Accrual / traditional" },
          ],
          helpText: "Cash basis is most common for small sole traders.",
        },
      ],
    },
    {
      title: "Data sources",
      description:
        "Upload bank statements or connect tools later — these power transaction categorisation.",
      fields: [
        {
          key: "dataSourceNotes",
          label: "Notes for the agent",
          type: "textarea",
          placeholder:
            "e.g. 'I'll upload Starling and PayPal statements monthly' — optional",
        },
      ],
    },
  ],
};

const OPERATIONS_PROFILE_SCHEMA: AgentProfileSchema = {
  steps: [
    {
      title: "About you",
      description: "So the agent can match your context and tone.",
      fields: [
        {
          key: "fullName",
          label: "Your name",
          type: "text",
          required: true,
        },
        {
          key: "role",
          label: "Your role",
          type: "text",
          placeholder: "e.g. Founder, Operations Manager, Chief of Staff",
          required: true,
        },
        {
          key: "companyName",
          label: "Company or team name",
          type: "text",
        },
        {
          key: "teamSize",
          label: "Team size",
          type: "select",
          options: [
            { value: "1", label: "Just me" },
            { value: "2-5", label: "2-5" },
            { value: "6-20", label: "6-20" },
            { value: "21-50", label: "21-50" },
            { value: "50+", label: "50+" },
          ],
        },
      ],
    },
    {
      title: "How you work",
      description: "Helps the agent draft replies in your voice and pick the right tools.",
      fields: [
        {
          key: "tools",
          label: "Tools you use day-to-day",
          type: "multiselect",
          options: [
            { value: "slack", label: "Slack" },
            { value: "gmail", label: "Gmail" },
            { value: "notion", label: "Notion" },
            { value: "linear", label: "Linear" },
            { value: "asana", label: "Asana" },
            { value: "google_docs", label: "Google Docs" },
            { value: "ms_teams", label: "Microsoft Teams" },
          ],
        },
        {
          key: "communicationStyle",
          label: "Default communication style",
          type: "select",
          defaultValue: "concise_friendly",
          options: [
            { value: "concise_friendly", label: "Concise and friendly" },
            { value: "detailed_professional", label: "Detailed and professional" },
            { value: "warm_personal", label: "Warm and personal" },
            { value: "formal", label: "Formal" },
          ],
        },
      ],
    },
  ],
};

const GENERAL_PROFILE_SCHEMA: AgentProfileSchema = {
  steps: [
    {
      title: "Quick intro",
      description: "Just enough so the agent knows who it's helping.",
      fields: [
        {
          key: "firstName",
          label: "First name",
          type: "text",
          required: true,
        },
        {
          key: "profession",
          label: "What do you do?",
          type: "text",
          placeholder: "e.g. Marketing consultant, freelance designer",
        },
        {
          key: "preferences",
          label: "Anything I should know about how you like to work?",
          type: "textarea",
          placeholder:
            "Optional. e.g. 'I prefer short replies' or 'I'm British, use UK spelling'",
        },
      ],
    },
  ],
};

export const ACCOUNTANCY_SYSTEM_PROMPT = `You are an expert UK accountant and financial assistant working with a small business owner or self-employed individual.

Your job is to:
1. Analyse any financial data, statements, transactions, receipts, invoices, or other documents the user shares with you.
2. Categorise transactions accurately — split between personal vs business, identify income vs expense, and use sensible UK tax-aware categories (e.g. Office, Travel, Subsistence, Software, Marketing, Professional Fees, Equipment, Cost of Sales).
3. Identify tax-deductible expenses under UK HMRC rules. When something is partially deductible (e.g. use-of-home, mixed-use vehicles, entertainment), call that out and explain the split.
4. Flag anomalies and anything unusual: duplicate transactions, round-number entries, vendors you haven't seen before, dates outside the period under review, missing receipts for large items, suspicious patterns.
5. Prepare clear, plain-English summaries: income vs expenses by category, net profit, VAT position if VAT-registered, and a list of items that need the user's attention or a CPA's review.

How you work:
- Always ground every figure in the data the user has provided. If you don't have enough data, say so clearly and ask for what you need — receipts, bank exports as CSV, last year's accounts, the trading period, VAT scheme, etc. Never invent figures.
- When you make a categorisation judgment, give a one-line reason. The user should be able to follow your reasoning.
- Be explicit about uncertainty. If something could be deductible or could not be (depends on HMRC's "wholly and exclusively" test, depends on the user's setup), say so and ask the clarifying question rather than assuming.
- You are not a substitute for a chartered accountant. For anything that affects a tax filing, recommend the user have their accountant review your output before submission. Frame your work as "materials for your accountant" rather than tax advice.
- Use British English spelling and UK formatting (DD/MM/YYYY dates, £ amounts).

Begin every new conversation by asking the user what they want to focus on and what data they can share.`;

export const OPERATIONS_SYSTEM_PROMPT = `You are an expert operations assistant helping a small business owner manage their day-to-day work.

You help with:
- Summarising long emails, threads, and documents into the essentials.
- Drafting tone-matched responses (concise, professional, friendly — match the original sender's register).
- Building task lists with clear next actions, owners, and due dates.
- Tracking follow-ups across conversations and surfacing what's overdue.
- Organising workflows into repeatable steps the user can hand off or automate later.

How you work:
- Ask for the source material before drafting anything. Don't invent the contents of an email, a meeting, or a document you haven't seen.
- When drafting a reply, ask who it's going to and what outcome the user wants if it isn't clear. Match the formality of the inbound message.
- Surface trade-offs explicitly when prioritising. "Doing X first means Y slips to next week" is more useful than ranking tasks silently.
- Prefer plain bullet lists over prose when summarising. Three bullets and a next action beats three paragraphs.
- Use British English spelling.

If you don't have enough context to do the task well, say so and ask one specific question rather than guessing.`;

export const GENERAL_SYSTEM_PROMPT = `You are a highly capable business and personal assistant. You adapt your style to whatever the user needs — answering questions, drafting documents, analysing data, researching topics, or summarising content.

How you work:
- Default to concise. Use prose for explanations, bullets for lists, and only add detail when the user asks for it or the topic genuinely warrants it.
- When asked a factual question you're not certain about, say what you do know, flag what you don't, and suggest what would resolve the uncertainty. Never fabricate.
- When asked to analyse data, show your working briefly so the user can sanity-check the conclusion.
- When asked to draft a document, ask one clarifying question if the audience, tone, or purpose is ambiguous — then write it without asking five more questions.
- Use British English spelling unless the user clearly prefers American English.

You are not a substitute for professional advice on legal, medical, tax, or financial matters. When the user asks something that needs a qualified professional, give them what you can, then recommend they verify with one.`;

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: "accountancy",
    name: "Accountancy agent",
    type: "accountancy",
    description:
      "Automates financial admin, expense categorisation, invoice management and tax preparation",
    capabilities: [
      "Categorise transactions",
      "Summarise income and expenses",
      "Prepare tax summaries",
      "Review invoices",
      "Flag anomalies",
    ],
    tools: [],
    systemPrompt: ACCOUNTANCY_SYSTEM_PROMPT,
    starterPrompts: [
      "Help me categorise these transactions from my latest bank statement.",
      "Summarise my income and expenses for last month.",
      "Which of these expenses look tax-deductible under HMRC rules?",
      "Review this invoice and flag anything unusual.",
    ],
    profileSchema: ACCOUNTANCY_PROFILE_SCHEMA,
  },
  {
    id: "operations",
    name: "Operations agent",
    type: "operations",
    description:
      "Automates daily business tasks, scheduling, follow-ups and workflow management",
    capabilities: [
      "Summarise emails",
      "Draft responses",
      "Create task lists",
      "Track follow-ups",
      "Organise workflows",
    ],
    tools: [],
    systemPrompt: OPERATIONS_SYSTEM_PROMPT,
    starterPrompts: [
      "Summarise this long email thread for me.",
      "Draft a polite follow-up reply.",
      "Turn these meeting notes into a task list with owners.",
      "What are my overdue follow-ups?",
    ],
    profileSchema: OPERATIONS_PROFILE_SCHEMA,
  },
  {
    id: "general",
    name: "General assistant",
    type: "general",
    description:
      "A flexible AI assistant for any business or personal automation task",
    capabilities: [
      "Answer questions",
      "Draft documents",
      "Analyse data",
      "Research topics",
      "Summarise content",
    ],
    tools: [],
    systemPrompt: GENERAL_SYSTEM_PROMPT,
    starterPrompts: [
      "Help me draft a professional email.",
      "Analyse the trends in this data.",
      "Research the latest developments on a topic.",
      "Summarise this article for me.",
    ],
    profileSchema: GENERAL_PROFILE_SCHEMA,
  },
];

const CONFIG_BY_TYPE = new Map<string, AgentConfig>(
  AGENT_CONFIGS.map((c) => [c.type, c])
);

export function getAgentConfig(type: string): AgentConfig | null {
  return CONFIG_BY_TYPE.get(type) ?? null;
}

export function listAgentConfigs(): AgentConfig[] {
  return AGENT_CONFIGS;
}
