"use client";

/**
 * The screen, as the assistant is allowed to see it and touch it.
 *
 * Two halves. `snapshotScreen` reads what is on the page — every button,
 * link, tab, field and heading, by the label a person sees — and goes with
 * each message so the model knows what "the Save button" refers to before it
 * asks to press anything. `performAction` is the other half: the model asked
 * for a press, a fill, a scroll or a fresh look, the turn is parked on the
 * server, and this does the thing and says what happened.
 *
 * **Labels, never elements.** The model is given text and hands back text.
 * It cannot address a node, a selector or an index into the DOM, only a label
 * that is actually on the page — so the worst a confused model can do is press
 * a button a person could have pressed. And not every one of those, either:
 *
 * **The delete rule is enforced here too.** The backend keeps every delete
 * tool away from anybody below manager, and tells the browser the same answer
 * as `can_delete` on `/assistant/status`. A control whose label reads like a
 * delete — remove, revoke, wipe, discard — is refused for those people, with a
 * sentence the model can pass on. Two enforcement points, one rule; the button
 * itself, pressed by the person's own hand, is still governed by the route
 * behind it, exactly as before.
 *
 * **What it deliberately cannot do.** It does not press anything the person
 * could not see — hidden, disabled, or outside the document — and it does not
 * submit a form by itself: `fill` fills, and pressing Save is a separate,
 * visible `click`. A model that wants to change data has a better path in the
 * module's own tools, which are checked and confirmed properly; this is for
 * the parts of the app that only exist as buttons.
 */

import type { PendingActionOut, ScreenControlIn } from "@/lib/types";

/** What the backend accepts per message; see `SendIn.screen`. */
const MAX_CONTROLS = 300;
const MAX_LABEL = 160;
const MAX_VALUE = 200;

/** Labels that mean "delete", in the words this app's buttons actually use. */
const DESTRUCTIVE = /\b(delete|remove|revoke|wipe|purge|erase|discard|destroy|drop)\b/i;

/** The assistant's own surface is not something it should be pressing. */
const OWN_SURFACE = "[data-assistant-ui]";

const CONTROL_SELECTOR = [
  "button",
  "a[href]",
  "[role=button]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=link]",
  "input",
  "textarea",
  "select",
  "[contenteditable=true]",
  "h1",
  "h2",
  "h3",
].join(",");

/** One thing on the page, with the element it stands for kept here, never sent. */
interface Control {
  kind: ScreenControlIn["kind"];
  label: string;
  value?: string;
  element: HTMLElement;
}

/* ── reading ─────────────────────────────────────────────────────────── */

function visible(element: HTMLElement): boolean {
  if (element.closest(OWN_SURFACE)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The label a person would use for a field. */
function fieldLabel(element: HTMLElement): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelled = element.getAttribute("aria-labelledby");
  if (labelled) {
    const named = labelled
      .split(/\s+/)
      .map((id) => text(document.getElementById(id)))
      .filter(Boolean)
      .join(" ");
    if (named) return named;
  }
  if (element.id) {
    const forLabel = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`);
    if (forLabel && text(forLabel)) return text(forLabel);
  }
  const wrapping = element.closest("label");
  if (wrapping) {
    const own = text(wrapping);
    if (own) return own;
  }
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();
  const name = element.getAttribute("name");
  return name ? name.trim() : "";
}

function controlLabel(element: HTMLElement): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return aria.trim();
  const title = element.getAttribute("title");
  const own = text(element);
  return own || (title ?? "").trim();
}

function fieldValue(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement) {
    if (element.type === "password") return undefined;
    if (element.type === "checkbox" || element.type === "radio") {
      return element.checked ? "checked" : "unchecked";
    }
    return element.value ? element.value.slice(0, MAX_VALUE) : undefined;
  }
  if (element instanceof HTMLTextAreaElement) {
    return element.value ? element.value.slice(0, MAX_VALUE) : undefined;
  }
  if (element instanceof HTMLSelectElement) {
    const chosen = element.selectedOptions[0];
    return chosen ? text(chosen).slice(0, MAX_VALUE) : undefined;
  }
  if (element.isContentEditable) {
    const inner = text(element);
    return inner ? inner.slice(0, MAX_VALUE) : undefined;
  }
  return undefined;
}

function classify(element: HTMLElement): Control | null {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");

  if (tag === "h1" || tag === "h2" || tag === "h3") {
    const label = text(element);
    return label ? { kind: "heading", label, value: tag, element } : null;
  }
  if (tag === "input") {
    const input = element as HTMLInputElement;
    if (input.type === "hidden") return null;
    if (input.type === "submit" || input.type === "button") {
      const label = input.value || controlLabel(element);
      return label ? { kind: "button", label, element } : null;
    }
    const label = fieldLabel(element);
    if (!label) return null;
    const kind = input.type === "checkbox" || input.type === "radio" ? "checkbox" : "field";
    return { kind, label, value: fieldValue(element), element };
  }
  if (tag === "textarea" || element.isContentEditable) {
    const label = fieldLabel(element);
    return label ? { kind: "field", label, value: fieldValue(element), element } : null;
  }
  if (tag === "select") {
    const label = fieldLabel(element);
    return label ? { kind: "select", label, value: fieldValue(element), element } : null;
  }
  const label = controlLabel(element);
  if (!label) return null;
  if (role === "tab") return { kind: "tab", label, element };
  if (tag === "a" || role === "link") return { kind: "link", label, element };
  return { kind: "button", label, element };
}

/** Everything on the page a person could act on, in document order. */
function controls(): Control[] {
  if (typeof document === "undefined") return [];
  const out: Control[] = [];
  const seen = new Set<HTMLElement>();
  for (const node of document.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)) {
    if (seen.has(node) || !visible(node)) continue;
    // A button inside a link (or the reverse) is one control, not two.
    if (node.parentElement?.closest(CONTROL_SELECTOR) && node.tagName !== "INPUT") {
      const outer = node.parentElement.closest<HTMLElement>(CONTROL_SELECTOR);
      if (outer && seen.has(outer)) continue;
    }
    const control = classify(node);
    if (!control) continue;
    if (control.kind !== "heading" && isDisabled(node)) continue;
    control.label = control.label.slice(0, MAX_LABEL);
    seen.add(node);
    out.push(control);
  }
  return out;
}

function isDisabled(element: HTMLElement): boolean {
  return (
    (element as HTMLButtonElement).disabled === true ||
    element.getAttribute("aria-disabled") === "true"
  );
}

/** The screen as it goes with a message: labels and values, nothing else. */
export function snapshotScreen(): ScreenControlIn[] | undefined {
  const found = controls();
  if (found.length === 0) return undefined;
  return found.slice(0, MAX_CONTROLS).map(({ kind, label, value }) => ({
    kind,
    label,
    value: value ?? null,
  }));
}

/* ── acting ──────────────────────────────────────────────────────────── */

export interface ActionResult {
  call_id: string;
  ok: boolean;
  output: string;
}

export interface ActionContext {
  /** From `/assistant/status`. False for everybody below manager. */
  canDelete: boolean;
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The control somebody meant, by label.
 *
 * Exact first, then a label that contains what was asked, and `nth` picks
 * between several of the same. Two candidates and no `nth` is ambiguity, and
 * ambiguity is a refusal with the options in it — pressing *a* Save button
 * when there are two is the failure this whole file exists to prevent.
 */
function find(
  kinds: readonly Control["kind"][],
  label: string,
  nth: unknown,
): { control?: Control; error?: string } {
  const asked = norm(label);
  if (!asked) return { error: "Say which control, by the label on it." };
  const pool = controls().filter((c) => kinds.includes(c.kind));
  let hits = pool.filter((c) => norm(c.label) === asked);
  if (hits.length === 0) hits = pool.filter((c) => norm(c.label).includes(asked));
  if (hits.length === 0) {
    const listed = pool.slice(0, 40).map((c) => `${c.kind}: ${c.label}`).join("; ");
    return {
      error: `Nothing on this screen is labelled "${label}". On it: ${listed || "nothing pressable"}.`,
    };
  }
  const index = typeof nth === "number" && Number.isFinite(nth) ? Math.trunc(nth) - 1 : 0;
  if (hits.length > 1 && (typeof nth !== "number" || index < 0 || index >= hits.length)) {
    return {
      error:
        `${hits.length} controls are labelled "${label}": ` +
        hits.map((c, i) => `${i + 1}. ${c.kind} "${c.label}"`).join(", ") +
        ". Say which with nth.",
    };
  }
  return { control: hits[Math.min(Math.max(index, 0), hits.length - 1)] };
}

function summary(): string {
  const list = controls()
    .slice(0, MAX_CONTROLS)
    .map((c) => `${c.kind}: ${c.label}${c.value ? ` = ${c.value}` : ""}`);
  return JSON.stringify({
    route: window.location.pathname,
    title: document.title,
    controls: list,
  });
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // React listens on the prototype setter; going through it is what makes a
  // controlled input notice a value it did not set itself.
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function settle(): Promise<void> {
  // Let React render what the press changed before the screen is read back.
  await new Promise((resolve) => window.setTimeout(resolve, 250));
}

async function click(args: Record<string, unknown>, ctx: ActionContext): Promise<string> {
  const label = typeof args.label === "string" ? args.label : "";
  const { control, error } = find(["button", "link", "tab"], label, args.nth);
  if (!control) return error ?? "Nothing to press.";
  if (!ctx.canDelete && DESTRUCTIVE.test(control.label)) {
    return (
      `"${control.label}" would delete or remove something, and that is a ` +
      "manager's call — this person cannot do it through the assistant. Say so; " +
      "do not look for another way."
    );
  }
  control.element.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  control.element.focus({ preventScroll: true });
  control.element.click();
  await settle();
  return JSON.stringify({
    pressed: `${control.kind}: ${control.label}`,
    now: JSON.parse(summary()) as unknown,
  });
}

async function fill(args: Record<string, unknown>): Promise<string> {
  const label = typeof args.label === "string" ? args.label : "";
  const raw = args.value;
  const { control, error } = find(["field", "select", "checkbox"], label, args.nth);
  if (!control) return error ?? "Nothing to fill.";
  const element = control.element;

  if (element instanceof HTMLSelectElement) {
    const wanted = norm(String(raw ?? ""));
    const option = Array.from(element.options).find(
      (o) => norm(o.value) === wanted || norm(text(o)) === wanted,
    ) ?? Array.from(element.options).find((o) => norm(text(o)).includes(wanted));
    if (!option) {
      const choices = Array.from(element.options).map((o) => text(o)).join(", ");
      return `"${control.label}" has no option like "${String(raw)}". Choices: ${choices}.`;
    }
    element.value = option.value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    return JSON.stringify({ filled: control.label, value: text(option) });
  }

  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    const on = raw === true || /^(true|yes|on|checked|1)$/i.test(String(raw ?? ""));
    if (element.checked !== on) element.click();
    await settle();
    return JSON.stringify({ filled: control.label, value: on ? "checked" : "unchecked" });
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.readOnly) return `"${control.label}" is read-only here.`;
    element.focus({ preventScroll: true });
    setNativeValue(element, String(raw ?? ""));
    await settle();
    return JSON.stringify({ filled: control.label, value: element.value });
  }

  if (element.isContentEditable) {
    element.focus({ preventScroll: true });
    element.textContent = String(raw ?? "");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    return JSON.stringify({ filled: control.label, value: text(element) });
  }
  return `"${control.label}" is not something that can be typed into.`;
}

function scrollingElement(): HTMLElement {
  // The app's main column scrolls, not the window, when the shell is fixed.
  const main = document.querySelector<HTMLElement>("main[data-scroll], main");
  if (main && main.scrollHeight > main.clientHeight + 4) return main;
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

async function scroll(args: Record<string, unknown>): Promise<string> {
  const to = typeof args.to === "string" ? args.to.trim() : "";
  const target = scrollingElement();
  const page = target.clientHeight || window.innerHeight;
  const word = norm(to);
  if (word === "top") target.scrollTo({ top: 0, behavior: "smooth" });
  else if (word === "bottom") target.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
  else if (word === "up") target.scrollBy({ top: -page * 0.85, behavior: "smooth" });
  else if (word === "down") target.scrollBy({ top: page * 0.85, behavior: "smooth" });
  else {
    const { control, error } = find(["heading", "button", "link", "tab", "field"], to, args.nth);
    if (!control) return error ?? "Nothing to scroll to.";
    control.element.scrollIntoView({ block: "start", behavior: "smooth" });
    await settle();
    return JSON.stringify({ scrolled_to: `${control.kind}: ${control.label}` });
  }
  await settle();
  return JSON.stringify({ scrolled: word });
}

/**
 * Do what the turn parked for, one action at a time, and say what happened.
 *
 * Every action gets an answer — a refusal is an answer — because the loop on
 * the server is waiting on exactly these call ids and a missing one is read
 * as "not done". Sequential rather than parallel: a press changes the screen
 * the next fill would read.
 */
export async function performActions(
  actions: PendingActionOut[],
  ctx: ActionContext,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions) {
    const args = action.arguments ?? {};
    let output: string;
    let ok = true;
    try {
      switch (action.tool_key) {
        case "app.screen":
          output = summary();
          break;
        case "app.click":
          output = await click(args, ctx);
          ok = output.startsWith("{");
          break;
        case "app.fill":
          output = await fill(args);
          ok = output.startsWith("{");
          break;
        case "app.scroll":
          output = await scroll(args);
          ok = output.startsWith("{");
          break;
        default:
          output = `The screen does not know how to ${action.tool_key}.`;
          ok = false;
      }
    } catch (caught) {
      ok = false;
      output = caught instanceof Error ? caught.message : "That could not be done on this screen.";
    }
    results.push({ call_id: action.call_id, ok, output });
  }
  return results;
}

/** Whether a tool is one the screen performs, by key. */
export function isClientTool(toolKey: string): boolean {
  return toolKey === "app.screen" || toolKey === "app.click" || toolKey === "app.fill" || toolKey === "app.scroll";
}
