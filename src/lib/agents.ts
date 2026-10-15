/**
 * AI agents — each person's own assistant, built from blocks.
 *
 * **Frontend only, for now.** There is no backend for this module yet, so an
 * agent lives in this browser's storage, keyed by the signed-in user. The
 * shapes here are the ones the API should take when it is built: an agent is
 * an identity (name, role, avatar), free-text instructions, and an ordered
 * list of steps, each a block kind plus that block's config. Swapping the
 * store below for SWR calls is the whole of the migration.
 *
 * **Blocks are code; an agent's steps are data.** The catalogue below is what
 * the builder offers and what the engine will one day run. Every block that
 * would act on the outside world drafts rather than acts — the person who owns
 * the agent sends, submits and approves. That is a decision, not a gap.
 */

import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import {
  Bell,
  Bot,
  Brain,
  CalendarClock,
  FileOutput,
  FileSearch,
  FileText,
  Gavel,
  GitBranch,
  Hourglass,
  Inbox,
  ListChecks,
  Mail,
  MessageCircleQuestion,
  Pause,
  PenLine,
  Play,
  ReceiptText,
  Scale,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";

/* ── the avatar ──────────────────────────────────────────────────────── */

/*
 * A soft, fuzzy blob of a character: a body shape in a bright colour, simple
 * eyes, maybe a mouth, maybe something to wear. Five choices make one, so
 * nothing is stored but the choices.
 */

export const BLOB_BODIES = ["cloud", "frog", "pebble", "heart", "mochi", "bean"] as const;
export const BLOB_EYES = ["dots", "googly", "wide", "happy", "joy", "sparkle"] as const;
export const BLOB_MOUTHS = ["none", "smile", "grin", "o"] as const;
export const BLOB_ACCESSORIES = ["none", "beret", "glasses", "shades", "bow", "party", "crown", "sprout"] as const;

export type BlobBody = (typeof BLOB_BODIES)[number];
export type BlobEyes = (typeof BLOB_EYES)[number];
export type BlobMouth = (typeof BLOB_MOUTHS)[number];
export type BlobAccessory = (typeof BLOB_ACCESSORIES)[number];

export const BLOB_LABEL: Record<BlobBody | BlobEyes | BlobMouth | BlobAccessory, string> = {
  cloud: "Cloud",
  frog: "Frog",
  pebble: "Pebble",
  heart: "Heart",
  mochi: "Mochi",
  bean: "Bean",
  dots: "Dots",
  googly: "Googly",
  wide: "Wide",
  happy: "Content",
  joy: "Joy",
  sparkle: "Sparkle",
  none: "None",
  smile: "Smile",
  grin: "Grin",
  o: "Oh",
  beret: "Beret",
  glasses: "Glasses",
  shades: "Shades",
  bow: "Bow",
  party: "Party hat",
  crown: "Crown",
  sprout: "Sprout",
};

/** Fixed colours rather than the theme accent: an agent looks the same to everyone. */
export const BLOB_COLOURS = [
  { key: "blue", label: "Blue", hue: 258, chroma: 0.2, light: 0.62 },
  { key: "lime", label: "Lime", hue: 128, chroma: 0.21, light: 0.84 },
  { key: "sunny", label: "Sunny", hue: 88, chroma: 0.17, light: 0.86 },
  { key: "pink", label: "Pink", hue: 345, chroma: 0.25, light: 0.66 },
  { key: "purple", label: "Purple", hue: 300, chroma: 0.2, light: 0.6 },
  { key: "orange", label: "Orange", hue: 55, chroma: 0.19, light: 0.74 },
  { key: "teal", label: "Teal", hue: 190, chroma: 0.13, light: 0.76 },
  { key: "snow", label: "Snow", hue: 250, chroma: 0.01, light: 0.95 },
] as const;

export type BlobColour = (typeof BLOB_COLOURS)[number]["key"];

export interface AvatarSpec {
  body: BlobBody;
  colour: BlobColour;
  eyes: BlobEyes;
  mouth: BlobMouth;
  accessory: BlobAccessory;
}

export const DEFAULT_AVATAR: AvatarSpec = {
  body: "cloud",
  colour: "blue",
  eyes: "dots",
  mouth: "none",
  accessory: "beret",
};

/** The four from the stage — good company for an empty page. */
export const STARTER_AVATARS: AvatarSpec[] = [
  { body: "cloud", colour: "blue", eyes: "dots", mouth: "none", accessory: "beret" },
  { body: "frog", colour: "lime", eyes: "googly", mouth: "none", accessory: "none" },
  { body: "pebble", colour: "sunny", eyes: "happy", mouth: "none", accessory: "glasses" },
  { body: "heart", colour: "pink", eyes: "dots", mouth: "none", accessory: "shades" },
];

export function randomAvatar(): AvatarSpec {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
  const body = pick(BLOB_BODIES);
  return {
    body,
    colour: pick(BLOB_COLOURS).key,
    eyes: body === "frog" ? "googly" : pick(BLOB_EYES),
    mouth: Math.random() < 0.6 ? "none" : pick(BLOB_MOUTHS),
    accessory: Math.random() < 0.3 ? "none" : pick(BLOB_ACCESSORIES),
  };
}

/**
 * Any stored avatar, made whole. Agents saved under an earlier avatar design
 * carry other fields entirely; they get the default character rather than a
 * broken drawing.
 */
export function normalizeAvatar(raw: unknown): AvatarSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
    list.includes(value as T) ? (value as T) : fallback;
  return {
    body: oneOf(r.body, BLOB_BODIES, DEFAULT_AVATAR.body),
    colour: oneOf(r.colour, BLOB_COLOURS.map((c) => c.key), DEFAULT_AVATAR.colour),
    eyes: oneOf(r.eyes, BLOB_EYES, DEFAULT_AVATAR.eyes),
    mouth: oneOf(r.mouth, BLOB_MOUTHS, DEFAULT_AVATAR.mouth),
    accessory: oneOf(r.accessory, BLOB_ACCESSORIES, DEFAULT_AVATAR.accessory),
  };
}

/* ── blocks ──────────────────────────────────────────────────────────── */

export type BlockGroup = "start" | "read" | "think" | "ask" | "act" | "wait";

export const BLOCK_GROUPS: { key: BlockGroup; label: string; hint: string }[] = [
  { key: "start", label: "Starts when", hint: "What wakes the agent up. One per agent." },
  { key: "read", label: "Read", hint: "Gather what it needs from the app." },
  { key: "think", label: "Think", hint: "Work something out." },
  { key: "ask", label: "Ask you", hint: "Stop and check with you." },
  { key: "act", label: "Draft", hint: "Prepare work for you. It never sends on its own." },
  { key: "wait", label: "Wait", hint: "Hold until something happens." },
];

export type FieldType = "text" | "textarea" | "number" | "select" | "toggle" | "time";

export interface BlockField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export type StepConfig = Record<string, string | number | boolean>;

export interface BlockDef {
  kind: string;
  group: BlockGroup;
  name: string;
  /** One sentence, shown in the palette. */
  blurb: string;
  icon: LucideIcon;
  fields: BlockField[];
  /** The line a step shows on the canvas, from its own config. */
  describe?: (config: StepConfig) => string;
}

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
const quoted = (v: unknown, fallback: string) => (str(v) ? `“${str(v)}”` : fallback);

export const BLOCKS: BlockDef[] = [
  // ── start ──
  {
    kind: "start_manual",
    group: "start",
    name: "When I ask",
    blurb: "Runs when you press Run, or ask it in chat.",
    icon: Play,
    fields: [],
    describe: () => "You start it yourself",
  },
  {
    kind: "start_new_task",
    group: "start",
    name: "A task is assigned to me",
    blurb: "A new Proposals task lands in your name.",
    icon: ListChecks,
    fields: [
      {
        key: "contains",
        label: "Only when the title contains",
        type: "text",
        placeholder: "Leave empty for every task",
      },
    ],
    describe: (c) => (str(c.contains) ? `New task titled ${quoted(c.contains, "")}` : "Every new task assigned to you"),
  },
  {
    kind: "start_new_tender",
    group: "start",
    name: "A new Ariba tender arrives",
    blurb: "The tender reader finds a new event.",
    icon: Gavel,
    fields: [
      { key: "keywords", label: "Only when it mentions", type: "text", placeholder: "e.g. cable, UPS, laptops" },
    ],
    describe: (c) => (str(c.keywords) ? `New tender mentioning ${quoted(c.keywords, "")}` : "Every new Ariba tender"),
  },
  {
    kind: "start_schedule",
    group: "start",
    name: "On a schedule",
    blurb: "Every morning, every week, or every month.",
    icon: CalendarClock,
    fields: [
      {
        key: "every",
        label: "How often",
        type: "select",
        options: opts(["weekday", "Every weekday"], ["day", "Every day"], ["week", "Every Monday"], ["month", "First of the month"]),
        default: "weekday",
      },
      { key: "at", label: "At", type: "time", default: "08:30" },
    ],
    describe: (c) => {
      const every = { weekday: "Every weekday", day: "Every day", week: "Every Monday", month: "On the 1st" }[str(c.every)] ?? "On a schedule";
      return `${every} at ${str(c.at) || "08:30"}`;
    },
  },
  {
    kind: "start_email",
    group: "start",
    name: "An email arrives",
    blurb: "A mail in your inbox matches what you set.",
    icon: Inbox,
    fields: [
      { key: "from", label: "From contains", type: "text", placeholder: "e.g. @supplier.com" },
      { key: "subject", label: "Subject contains", type: "text", placeholder: "e.g. RFQ" },
    ],
    describe: (c) => {
      const parts = [str(c.from) && `from ${str(c.from)}`, str(c.subject) && `about ${quoted(c.subject, "")}`].filter(Boolean);
      return parts.length ? `Mail ${parts.join(", ")}` : "Any mail to you";
    },
  },

  // ── read ──
  {
    kind: "read_documents",
    group: "read",
    name: "Read the task's documents",
    blurb: "Opens the attachments on the task.",
    icon: FileSearch,
    fields: [
      {
        key: "which",
        label: "Which files",
        type: "select",
        options: opts(["all", "Everything attached"], ["pdf", "PDFs only"], ["excel", "Spreadsheets only"]),
        default: "all",
      },
    ],
    describe: (c) => ({ all: "Every attachment", pdf: "PDF attachments", excel: "Spreadsheet attachments" })[str(c.which)] ?? "Every attachment",
  },
  {
    kind: "extract_requirements",
    group: "read",
    name: "Pull out items & requirements",
    blurb: "Lines, quantities, deadline and conditions.",
    icon: ScrollText,
    fields: [
      { key: "notes", label: "Anything to look out for", type: "textarea", placeholder: "e.g. always note the warranty and delivery terms" },
      {
        key: "ai",
        label: "Let AI read what the tables miss",
        type: "toggle",
        default: true,
        help: "Item tables are read by the app. Other text goes to a free AI model; only scans need Claude (a fraction of a cent).",
      },
    ],
    describe: (c) => (str(c.notes) ? `Watching for: ${str(c.notes)}` : "Items, quantities, deadline, conditions"),
  },
  {
    kind: "lookup_tasks",
    group: "read",
    name: "Look up my tasks",
    blurb: "Your open Proposals tasks.",
    icon: ListChecks,
    fields: [
      {
        key: "which",
        label: "Which",
        type: "select",
        options: opts(["due_week", "Due this week"], ["overdue", "Overdue"], ["open", "Everything open"]),
        default: "due_week",
      },
    ],
    describe: (c) => ({ due_week: "Tasks due this week", overdue: "Overdue tasks", open: "All open tasks" })[str(c.which)] ?? "Your tasks",
  },
  {
    kind: "lookup_history",
    group: "read",
    name: "Search past quotes",
    blurb: "What we quoted before for the same things.",
    icon: Search,
    fields: [
      { key: "for", label: "Look for", type: "text", placeholder: "Leave empty to use the items found earlier" },
      {
        key: "since",
        label: "How far back",
        type: "select",
        options: opts(["6m", "6 months"], ["1y", "1 year"], ["3y", "3 years"], ["all", "All time"]),
        default: "1y",
      },
    ],
    describe: (c) => `${str(c.for) ? quoted(c.for, "") : "The items found"} · last ${({ "6m": "6 months", "1y": "year", "3y": "3 years", all: "ever" })[str(c.since)] ?? "year"}`,
  },
  {
    kind: "read_supplier_quotes",
    group: "read",
    name: "Read supplier quotes",
    blurb: "Prices, lead times and terms from their files.",
    icon: FileText,
    fields: [
      {
        key: "from",
        label: "From",
        type: "select",
        options: opts(["replies", "Replies to the RFQ"], ["task", "Files on the task"], ["both", "Both"]),
        default: "replies",
      },
    ],
    describe: (c) => ({ replies: "From the RFQ replies", task: "From files on the task", both: "From replies and the task" })[str(c.from)] ?? "",
  },

  // ── think ──
  {
    kind: "ask_model",
    group: "think",
    name: "Think it through",
    blurb: "Your own instruction, answered by the model.",
    icon: Brain,
    fields: [
      { key: "prompt", label: "What should it work out?", type: "textarea", required: true, placeholder: "e.g. Which of these items are hard to source in the UAE, and why?" },
      { key: "web", label: "Search the web", type: "toggle", default: false },
      {
        key: "shape",
        label: "Answer as",
        type: "select",
        options: opts(["text", "A few sentences"], ["list", "A list"], ["table", "A table"]),
        default: "text",
      },
    ],
    describe: (c) => (str(c.prompt) ? `${str(c.prompt)}${c.web ? " · web" : ""}` : "No instruction yet"),
  },
  {
    kind: "find_suppliers",
    group: "think",
    name: "Find suppliers",
    blurb: "A shortlist for the items, with contacts.",
    icon: Users,
    fields: [
      { key: "count", label: "How many", type: "number", default: 5 },
      {
        key: "where",
        label: "Where",
        type: "select",
        options: opts(["uae", "UAE"], ["gcc", "GCC"], ["world", "Anywhere"]),
        default: "uae",
      },
      {
        key: "web",
        label: "Search the web too",
        type: "toggle",
        default: false,
        help: "Our own supplier quotes are searched first, free. The web adds a small fee per search.",
      },
    ],
    describe: (c) => `Up to ${c.count || 5} in the ${({ uae: "UAE", gcc: "GCC", world: "world" })[str(c.where)] ?? "UAE"} · our suppliers${c.web ? " + the web" : ""}`,
  },
  {
    kind: "compare_quotes",
    group: "think",
    name: "Compare supplier quotes",
    blurb: "Like for like, per unit, ranked.",
    icon: Scale,
    fields: [
      {
        key: "pick",
        label: "Pick by",
        type: "select",
        options: opts(["cheapest", "Cheapest complete"], ["fastest", "Fastest delivery"], ["value", "Best value"]),
        default: "cheapest",
      },
      { key: "margin", label: "Margin on top (%)", type: "number", default: 0 },
    ],
    describe: (c) => `${({ cheapest: "Cheapest complete", fastest: "Fastest delivery", value: "Best value" })[str(c.pick)] ?? "Cheapest complete"}${Number(c.margin) ? ` + ${c.margin}% margin` : ""}`,
  },
  {
    kind: "summarise",
    group: "think",
    name: "Summarise",
    blurb: "Boil what it has into something short.",
    icon: Sparkles,
    fields: [
      {
        key: "length",
        label: "Length",
        type: "select",
        options: opts(["line", "One line"], ["para", "A short paragraph"], ["bullets", "Bullet points"]),
        default: "bullets",
      },
      { key: "for", label: "Written for", type: "text", placeholder: "e.g. my manager" },
      { key: "ai", label: "Write it up with AI", type: "toggle", default: true, help: "The facts come from the app; a free AI model writes them up. Off: the app's own plain version." },
    ],
    describe: (c) => `${({ line: "One line", para: "A paragraph", bullets: "Bullet points" })[str(c.length)] ?? "Bullet points"}${str(c.for) ? ` for ${str(c.for)}` : ""}`,
  },
  {
    kind: "check",
    group: "think",
    name: "Check a condition",
    blurb: "Carry on only if something is true.",
    icon: GitBranch,
    fields: [
      { key: "if", label: "Carry on only if", type: "text", required: true, placeholder: "e.g. the deadline is more than 3 days away" },
      {
        key: "else",
        label: "Otherwise",
        type: "select",
        options: opts(["stop", "Stop quietly"], ["tell", "Stop and tell me"], ["ask", "Ask me what to do"]),
        default: "tell",
      },
    ],
    describe: (c) => (str(c.if) ? `Only if ${str(c.if)}` : "No condition yet"),
  },

  // ── ask ──
  {
    kind: "ask_me",
    group: "ask",
    name: "Ask me",
    blurb: "Pauses with a question or something to check.",
    icon: MessageCircleQuestion,
    fields: [
      { key: "question", label: "Question", type: "textarea", required: true, placeholder: "e.g. Here is the supplier shortlist — remove any we should not contact." },
      {
        key: "mode",
        label: "You will",
        type: "select",
        options: opts(["review", "Check its work and approve"], ["answer", "Type an answer"], ["files", "Upload files"]),
        default: "review",
      },
    ],
    describe: (c) => (str(c.question) ? str(c.question) : "No question yet"),
  },
  {
    kind: "get_approval",
    group: "ask",
    name: "Get approval",
    blurb: "Someone signs off before it goes on.",
    icon: ShieldCheck,
    fields: [
      {
        key: "from",
        label: "From",
        type: "select",
        options: opts(["me", "Me"], ["manager", "My manager"]),
        default: "me",
      },
      { key: "note", label: "Note for them", type: "textarea" },
    ],
    describe: (c) => `Approval from ${c.from === "manager" ? "your manager" : "you"}`,
  },

  // ── act (drafts) ──
  {
    kind: "draft_email",
    group: "act",
    name: "Draft an email",
    blurb: "Written and waiting in your drafts. You send it.",
    icon: Mail,
    fields: [
      {
        key: "to",
        label: "To",
        type: "select",
        options: opts(["suppliers", "Each supplier found"], ["customer", "The customer"], ["me", "Me"], ["other", "Someone else"]),
        default: "suppliers",
      },
      { key: "address", label: "Address", type: "text", placeholder: "Only for someone else" },
      { key: "subject", label: "Subject", type: "text", placeholder: "e.g. RFQ — {task title}" },
      { key: "body", label: "Anything to add", type: "textarea", placeholder: "Added to the email as you write it." },
      { key: "ai", label: "Word it with AI", type: "toggle", default: true, help: "Our RFQ template holds the facts; a free AI model makes it read well. Off: the template as it is." },
    ],
    describe: (c) => {
      const to = { suppliers: "each supplier", customer: "the customer", me: "you", other: str(c.address) || "someone" }[str(c.to)] ?? "someone";
      return `To ${to}${str(c.subject) ? ` · ${str(c.subject)}` : ""}`;
    },
  },
  {
    kind: "draft_quote_request",
    group: "act",
    name: "Draft a quote request",
    blurb: "A quote in Quote requests, as a draft.",
    icon: ReceiptText,
    fields: [
      {
        key: "currency",
        label: "Currency",
        type: "select",
        options: opts(["AED", "AED"], ["USD", "USD"], ["EUR", "EUR"], ["GBP", "GBP"]),
        default: "AED",
      },
      { key: "margin", label: "Margin (%)", type: "number", default: 15 },
    ],
    describe: (c) => `${c.currency || "AED"} at ${c.margin ?? 15}% margin`,
  },
  {
    kind: "make_document",
    group: "act",
    name: "Make a document",
    blurb: "A PDF or spreadsheet of what it found.",
    icon: FileOutput,
    fields: [
      {
        key: "format",
        label: "Format",
        type: "select",
        options: opts(["pdf", "PDF"], ["excel", "Excel"]),
        default: "pdf",
      },
      { key: "title", label: "Title", type: "text", placeholder: "e.g. Requirements — {task title}" },
    ],
    describe: (c) => `${c.format === "excel" ? "Excel" : "PDF"}${str(c.title) ? ` · ${str(c.title)}` : ""}`,
  },
  {
    kind: "notify_me",
    group: "act",
    name: "Tell me",
    blurb: "A notification with what happened.",
    icon: Bell,
    fields: [
      {
        key: "via",
        label: "How",
        type: "select",
        options: opts(["app", "In the app"], ["email", "Email to me"], ["both", "Both"]),
        default: "app",
      },
      { key: "message", label: "Message", type: "textarea", placeholder: "Leave empty and it says what it did." },
    ],
    describe: (c) => `${({ app: "In the app", email: "By email", both: "In the app and by email" })[str(c.via)] ?? "In the app"}${str(c.message) ? ` · ${str(c.message)}` : ""}`,
  },

  // ── wait ──
  {
    kind: "wait_replies",
    group: "wait",
    name: "Wait for replies",
    blurb: "Until suppliers answer, or time runs out.",
    icon: Hourglass,
    fields: [
      { key: "min", label: "Carry on after this many replies", type: "number", default: 2 },
      { key: "days", label: "Give up after (days)", type: "number", default: 5 },
    ],
    describe: (c) => `${c.min ?? 2} replies, or ${c.days ?? 5} days`,
  },
  {
    kind: "wait_status",
    group: "wait",
    name: "Wait until…",
    blurb: "A quote is approved, a task closes.",
    icon: Timer,
    fields: [
      {
        key: "until",
        label: "Until",
        type: "select",
        options: opts(["quote_approved", "The quote is approved"], ["task_closed", "The task is closed"], ["deadline", "The deadline is near"]),
        default: "quote_approved",
      },
      { key: "days", label: "Give up after (days)", type: "number", default: 14 },
    ],
    describe: (c) => ({ quote_approved: "The quote is approved", task_closed: "The task is closed", deadline: "The deadline is near" })[str(c.until)] ?? "",
  },
  {
    kind: "pause",
    group: "wait",
    name: "Pause",
    blurb: "A fixed wait before the next step.",
    icon: Pause,
    fields: [
      { key: "amount", label: "For", type: "number", default: 1 },
      {
        key: "unit",
        label: "Unit",
        type: "select",
        options: opts(["hours", "Hours"], ["days", "Days"]),
        default: "days",
      },
    ],
    describe: (c) => `${c.amount ?? 1} ${c.unit === "hours" ? "hour" : "day"}${Number(c.amount ?? 1) === 1 ? "" : "s"}`,
  },
];

export const BLOCKS_BY_KIND: Record<string, BlockDef> = Object.fromEntries(BLOCKS.map((b) => [b.kind, b]));

/** The tone each group wears — a soft fill and its ink, from the shared tokens. */
export const GROUP_TONE: Record<BlockGroup, { soft: string; ink: string; edge: string }> = {
  start: { soft: "bg-accent-soft", ink: "text-accent-text", edge: "border-accent" },
  read: { soft: "bg-info-soft", ink: "text-info", edge: "border-info" },
  think: { soft: "bg-second-soft", ink: "text-second-text", edge: "border-second" },
  ask: { soft: "bg-warn-soft", ink: "text-warn", edge: "border-warn" },
  act: { soft: "bg-positive-soft", ink: "text-positive", edge: "border-positive" },
  wait: { soft: "bg-panel-3", ink: "text-ink-2", edge: "border-line-strong" },
};

/* ── agents ──────────────────────────────────────────────────────────── */

export interface Step {
  id: string;
  kind: string;
  config: StepConfig;
}

export interface Agent {
  id: string;
  name: string;
  /** One line: what it is for. Shown under its name everywhere. */
  role: string;
  avatar: AvatarSpec;
  /** What the person wrote in their own words. The model reads this beside the steps. */
  instructions: string;
  /** The first step is always the trigger, when there is one. */
  steps: Step[];
  createdAt: string;
  updatedAt: string;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultConfig(kind: string): StepConfig {
  const block = BLOCKS_BY_KIND[kind];
  const config: StepConfig = {};
  for (const field of block?.fields ?? []) {
    if (field.default !== undefined) config[field.key] = field.default;
  }
  return config;
}

export function makeStep(kind: string, config?: StepConfig): Step {
  return { id: newId(), kind, config: { ...defaultConfig(kind), ...(config ?? {}) } };
}

export function blankAgent(): Agent {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: "",
    role: "",
    avatar: randomAvatar(),
    instructions: "",
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function triggerOf(agent: Pick<Agent, "steps">): Step | null {
  const first = agent.steps[0];
  return first && BLOCKS_BY_KIND[first.kind]?.group === "start" ? first : null;
}

export function describeStep(step: Step): string {
  const block = BLOCKS_BY_KIND[step.kind];
  return block?.describe?.(step.config) || block?.blurb || step.kind;
}

/** The required fields a step has left empty. */
export function missingFields(step: Step): BlockField[] {
  const block = BLOCKS_BY_KIND[step.kind];
  return (block?.fields ?? []).filter((f) => f.required && !str(step.config[f.key]));
}

export interface Problem {
  stepId?: string;
  message: string;
}

/** What stands between this agent and being ready to run. */
export function problemsOf(agent: Agent): Problem[] {
  const problems: Problem[] = [];
  if (!agent.name.trim()) problems.push({ message: "It needs a name." });
  if (!triggerOf(agent)) problems.push({ message: "Choose what starts it." });
  if (agent.steps.filter((s) => BLOCKS_BY_KIND[s.kind]?.group !== "start").length === 0 && !agent.instructions.trim()) {
    problems.push({ message: "Give it something to do: write it, or add blocks." });
  }
  for (const step of agent.steps) {
    const missing = missingFields(step);
    if (missing.length) {
      problems.push({
        stepId: step.id,
        message: `${BLOCKS_BY_KIND[step.kind]?.name ?? step.kind}: ${missing.map((f) => f.label.toLowerCase()).join(", ")} is empty.`,
      });
    }
  }
  return problems;
}

/* ── starting points ─────────────────────────────────────────────────── */

export interface AgentTemplate {
  key: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
  role: string;
  instructions: string;
  steps: [string, StepConfig?][];
}

export const TEMPLATES: AgentTemplate[] = [
  {
    key: "presales",
    name: "Presales helper",
    blurb: "From a new task to a draft quote, asking you at each turn.",
    icon: Bot,
    role: "Prepares RFQs and draft quotes for my presales tasks",
    instructions:
      "When I get a new presales task, read what the customer wants, find suppliers who can supply it, " +
      "and draft the RFQ emails for me to send. When replies come in, compare them and draft the quote. " +
      "Check with me before contacting anyone.",
    steps: [
      ["start_new_task"],
      ["read_documents"],
      ["extract_requirements"],
      ["lookup_history"],
      ["find_suppliers"],
      ["ask_me", { question: "Here is the supplier shortlist. Remove any we should not contact.", mode: "review" }],
      ["draft_email", { to: "suppliers", subject: "RFQ — {task title}", body: "Ask for their best price, lead time and validity for the items." }],
      ["wait_replies"],
      ["read_supplier_quotes"],
      ["compare_quotes"],
      ["draft_quote_request"],
      ["notify_me", { message: "The draft quote is ready for you to check." }],
    ],
  },
  {
    key: "tenders",
    name: "Tender watcher",
    blurb: "Reads every new Ariba tender and tells you if it is worth a look.",
    icon: Gavel,
    role: "Screens new Ariba tenders for me",
    instructions: "When a new tender arrives, read it and tell me in a few lines what it is, when it closes, and whether it fits what we sell.",
    steps: [
      ["start_new_tender"],
      ["read_documents"],
      ["extract_requirements"],
      ["summarise", { length: "bullets" }],
      ["notify_me"],
    ],
  },
  {
    key: "brief",
    name: "Morning brief",
    blurb: "What is due this week, every morning before you start.",
    icon: CalendarClock,
    role: "Gives me my day each morning",
    instructions: "Every weekday morning, look at my open tasks and tell me what is due this week, what is late, and what to do first.",
    steps: [
      ["start_schedule", { every: "weekday", at: "08:30" }],
      ["lookup_tasks", { which: "open" }],
      ["summarise", { length: "bullets", for: "me" }],
      ["notify_me", { via: "both" }],
    ],
  },
  {
    key: "chaser",
    name: "Reply chaser",
    blurb: "Drafts a polite nudge to suppliers who have gone quiet.",
    icon: PenLine,
    role: "Chases suppliers who have not replied",
    instructions: "If a supplier has not replied to an RFQ after three days, draft a short reminder for me to send.",
    steps: [
      ["start_schedule", { every: "day", at: "10:00" }],
      ["lookup_tasks", { which: "open" }],
      ["check", { if: "an RFQ has had no reply for 3 days", else: "stop" }],
      ["draft_email", { to: "suppliers", subject: "Following up — {task title}", body: "A short, friendly reminder." }],
      ["notify_me"],
    ],
  },
];

export function stepsFromTemplate(template: AgentTemplate): Step[] {
  return template.steps.map(([kind, config]) => makeStep(kind, config));
}

/**
 * Blocks suggested from what the person wrote.
 *
 * Plain keyword matching, on purpose: it is instant, free, and right often
 * enough to save dragging. The model can do this properly once there is a
 * backend to call it from.
 */
const SUGGESTIONS: [RegExp, string, StepConfig?][] = [
  [/\b(every|each)\s+(morning|day|weekday)|\bdaily\b/i, "start_schedule", { every: "weekday" }],
  [/\bevery\s+(week|monday)|\bweekly\b/i, "start_schedule", { every: "week" }],
  [/\btender|ariba\b/i, "start_new_tender"],
  [/\bnew task|task is assigned|assigned to me|get a (new )?task/i, "start_new_task"],
  [/\b(an? )?e-?mail (arrives|comes in)|when .* mails? me/i, "start_email"],
  [/\b(read|open|go through)\b.*\b(document|attachment|file|pdf)s?/i, "read_documents"],
  [/\brequirement|what the customer wants|items?\b.*\bquantit/i, "extract_requirements"],
  [/\bmy (open )?tasks|what is due|overdue/i, "lookup_tasks"],
  [/\b(past|previous|before|history|last time)\b.*\bquote/i, "lookup_history"],
  [/\bfind\b.*\bsuppliers?|supplier shortlist|who can supply/i, "find_suppliers"],
  [/\b(draft|write)\b.*\b(rfq|e-?mail|mail|reminder)|rfq e-?mails?/i, "draft_email"],
  [/\bwait\b.*\brepl|replies come in|when .* repl/i, "wait_replies"],
  [/\bread\b.*\b(their|supplier)\b.*\bquotes?|repl(y|ies)\b.*\bquotes?/i, "read_supplier_quotes"],
  [/\bcompare\b/i, "compare_quotes"],
  [/\b(draft|prepare)\b.*\bquote\b|draft the quote/i, "draft_quote_request"],
  [/\bsummar|in a few lines|tell me what it is/i, "summarise"],
  [/\b(check|ask) with me|before (contacting|sending)|let me (check|approve)/i, "ask_me"],
  [/\bapprov/i, "get_approval"],
  [/\b(pdf|spreadsheet|excel|report)\b/i, "make_document"],
  [/\b(tell|notify|let me know|remind) me\b/i, "notify_me"],
];

export function suggestSteps(text: string): Step[] {
  const order = new Map<string, { at: number; config?: StepConfig }>();
  for (const [pattern, kind, config] of SUGGESTIONS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const at = BLOCKS_BY_KIND[kind].group === "start" ? -1 : match.index;
    const seen = order.get(kind);
    if (!seen || at < seen.at) order.set(kind, { at, config });
  }
  const picked = [...order.entries()].sort((a, b) => a[1].at - b[1].at);
  // One trigger only — the earliest-mentioned schedule or event wins.
  let haveTrigger = false;
  const steps: Step[] = [];
  for (const [kind, { config }] of picked) {
    if (BLOCKS_BY_KIND[kind].group === "start") {
      if (haveTrigger) continue;
      haveTrigger = true;
    }
    steps.push(makeStep(kind, config));
  }
  if (!haveTrigger) steps.unshift(makeStep("start_manual"));
  return steps;
}

/* ── the store: the API ─────────────────────────────────────────────── */

/*
 * Agents live in the backend (``/agents``) now. They were kept in this
 * browser while the builder was made, so the first load after the switch
 * moves any agents still in localStorage up to the API — same ids, so links
 * keep working — and then forgets them locally.
 */

interface AgentApi {
  id: string;
  name: string;
  role: string;
  avatar: unknown;
  instructions: string;
  steps: Step[];
  created_at: string;
  updated_at: string;
}

function fromApi(a: AgentApi): Agent {
  return {
    id: a.id,
    name: a.name,
    role: a.role,
    avatar: normalizeAvatar(a.avatar),
    instructions: a.instructions,
    steps: a.steps ?? [],
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function toApi(a: Agent) {
  return {
    id: a.id,
    name: a.name.trim() || "Unnamed",
    role: a.role.trim(),
    avatar: a.avatar,
    instructions: a.instructions,
    steps: a.steps,
  };
}

const LEGACY_PREFIX = "hamdaz.agents.v1.";
const EMPTY: Agent[] = [];
const moving = new Set<string>();

/** Agents left in this browser from before the backend, moved up once. */
async function moveLocalAgents(userId: string, known: Agent[], refresh: () => void) {
  if (!userId || moving.has(userId)) return;
  let local: Agent[] = [];
  try {
    const raw = window.localStorage.getItem(LEGACY_PREFIX + userId);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) local = parsed as Agent[];
  } catch {
    return;
  }
  if (local.length === 0) return;
  moving.add(userId);
  const have = new Set(known.map((a) => a.id));
  let failed = false;
  for (const agent of local) {
    if (have.has(agent.id)) continue;
    try {
      await api.post("/agents", toApi({ ...agent, avatar: normalizeAvatar(agent.avatar) }));
    } catch {
      failed = true;
    }
  }
  if (!failed) {
    try {
      window.localStorage.removeItem(LEGACY_PREFIX + userId);
    } catch {
      // Harmless: the ids are known now, so a second pass adds nothing.
    }
  }
  moving.delete(userId);
  refresh();
}

export function useAgents(userId: string) {
  const { data, error, isLoading, mutate } = useSWR<AgentApi[]>(userId ? "/agents" : null);
  const agents = useMemo(() => (data ? data.map(fromApi) : EMPTY), [data]);

  useEffect(() => {
    if (data) void moveLocalAgents(userId, agents, () => void mutate());
  }, [data, agents, userId, mutate]);

  const save = useCallback(
    async (agent: Agent, isNew: boolean): Promise<Agent> => {
      const saved = isNew
        ? await api.post<AgentApi>("/agents", toApi(agent))
        : await api.put<AgentApi>(`/agents/${agent.id}`, toApi(agent));
      await mutate();
      return fromApi(saved);
    },
    [mutate],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.del(`/agents/${id}`);
      await mutate();
    },
    [mutate],
  );

  const duplicate = useCallback(
    async (id: string): Promise<Agent | null> => {
      const source = agents.find((a) => a.id === id);
      if (!source) return null;
      const copy: Agent = {
        ...source,
        id: newId(),
        name: `${source.name} (copy)`.slice(0, 80),
        steps: source.steps.map((s) => ({ ...s, id: newId(), config: { ...s.config } })),
      };
      const saved = await api.post<AgentApi>("/agents", toApi(copy));
      await mutate();
      return fromApi(saved);
    },
    [agents, mutate],
  );

  return { agents, error, loading: isLoading && !data, save, remove, duplicate };
}

/* ── runs ────────────────────────────────────────────────────────────── */

export type RunStatus = "running" | "waiting" | "done" | "failed" | "stopped";
export type StepStatus = "pending" | "running" | "waiting" | "done" | "skipped" | "failed" | "stopped";

export interface Source {
  label: string;
  detail: string | null;
  url: string | null;
}

export interface StepResult {
  step_id: string;
  kind: string;
  name: string;
  status: StepStatus;
  headline: string | null;
  output: Record<string, unknown>;
  sources: Source[];
  notes: string[];
  ai: { model: string; free?: boolean; input_tokens: number; output_tokens: number; searches: number; cost_usd: string } | null;
  started_at?: string;
  finished_at?: string;
  seconds?: number;
}

export interface RunSummary {
  id: string;
  agent_id: string;
  task_id: string | null;
  task_title: string | null;
  status: RunStatus;
  summary: string | null;
  cost_usd: string;
  created_at: string;
  finished_at: string | null;
}

export interface Run extends RunSummary {
  results: StepResult[];
  question: { title: string; message?: string | null; mode?: string; step_id: string; about_step_id?: string | null } | null;
  error: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
  started_at: string | null;
}

/** A run in the list across every agent of yours. */
export interface RecentRun extends RunSummary {
  agent_name: string;
  agent_avatar: unknown;
  question_title: string | null;
}

/** Your latest runs, the ones waiting for you first. Polled gently, for the badge. */
export function useRecentRuns(enabled = true) {
  return useSWR<RecentRun[]>(enabled ? "/agents/runs/recent" : null, {
    refreshInterval: 30_000,
    dedupingInterval: 10_000,
    shouldRetryOnError: false,
  });
}

export interface AgentTask {
  id: string;
  title: string;
  end_user: string | null;
  deadline: string | null;
  status: string | null;
}

export interface AgentStatus {
  model: string;
  effort: string;
  configured: boolean;
  web_allowed: boolean;
}

export const isLive = (status: RunStatus | undefined) => status === "running" || status === "waiting";

export function useRuns(agentId: string | null) {
  return useSWR<RunSummary[]>(agentId ? `/agents/${agentId}/runs` : null, { dedupingInterval: 2_000 });
}

/** A run, followed while it works: every second and a half, then not at all. */
export function useRun(runId: string | null) {
  return useSWR<Run>(runId ? `/agents/runs/${runId}` : null, {
    refreshInterval: (latest) => (latest && !isLive(latest.status) ? 0 : 1500),
    dedupingInterval: 1_000,
  });
}
