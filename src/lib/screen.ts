/**
 * Reading the screen for the companion — text, not pictures.
 *
 * Three readings, all of what the person can see and nothing else:
 *
 * - **the page**: its visible text, condensed, so a question about one figure
 *   can be answered from the total, header or toggle that explains it;
 * - **around a box**: the label above it (its column), the line it sits on
 *   (its row), the heading over it (its section), and the currencies shown;
 * - **what can be pressed**: buttons, links, tabs and fields, each tagged with
 *   a short id the walk-through can point at.
 *
 * Everything the companion draws itself carries `data-companion` and is left
 * out, so it never reads its own bubble back.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Around {
  column: string;
  row: string;
  section: string;
  currencies: string[];
  page_text: string;
}

export interface Pressable {
  id: string;
  label: string;
  kind: string;
}

const CURRENCY = /\b(AED|USD|EUR|GBP|SAR|QAR|OMR|KWD|BHD|INR|CNY|JPY|CHF|SGD)\b/g;
const SKIP = "[data-companion],script,style,noscript,svg title";

function visible(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

interface Bit {
  text: string;
  rect: DOMRect;
  el: Element;
}

/** Every visible piece of text, with where it is. */
function bits(): Bit[] {
  const out: Bit[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    const parent = node.parentElement;
    if (!text || !parent || parent.closest(SKIP)) continue;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!visible(rect)) continue;
    out.push({ text, rect, el: parent });
  }
  return out;
}

/** The visible page as lines of text, top to bottom, left to right. */
export function pageText(limit = 5000): string {
  const all = bits().sort((a, b) => Math.round(a.rect.top / 8) - Math.round(b.rect.top / 8) || a.rect.left - b.rect.left);
  const lines: string[] = [];
  let lineTop = -1;
  let current: string[] = [];
  for (const b of all) {
    if (lineTop < 0 || Math.abs(b.rect.top - lineTop) > 8) {
      if (current.length) lines.push(current.join(" | "));
      current = [];
      lineTop = b.rect.top;
    }
    current.push(b.text);
  }
  if (current.length) lines.push(current.join(" | "));
  return lines.join("\n").slice(0, limit);
}

function overlaps(a: DOMRect, b: Box): boolean {
  const x = Math.max(0, Math.min(a.right, b.left + b.width) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.top + b.height) - Math.max(a.top, b.top));
  return x * y >= 0.5 * Math.max(1, a.width * a.height);
}

/** The text inside a box, plus form values and labelled controls in it. */
export function textIn(box: Box, limit = 6000): string {
  const parts = bits().filter((b) => overlaps(b.rect, box)).map((b) => b.text);
  for (const el of document.querySelectorAll<HTMLElement>("input, textarea, select, [aria-label], [title]")) {
    if (el.closest("[data-companion]") || !overlaps(el.getBoundingClientRect(), box)) continue;
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || "";
    const value =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.value
        : el instanceof HTMLSelectElement
          ? el.selectedOptions[0]?.text ?? ""
          : "";
    const line = [label, value].filter(Boolean).join(": ");
    if (line && !parts.includes(line)) parts.push(line);
  }
  return parts.join("\n").slice(0, limit);
}

/** What surrounds a box: the label over it, the line it is on, the heading above it. */
export function around(box: Box): Around {
  const all = bits();
  const midX = box.left + box.width / 2;
  const midY = box.top + box.height / 2;
  const inside = (b: Bit) => overlaps(b.rect, box);

  // The column: the nearest short text above the box that spans its middle.
  const column = all
    .filter((b) => !inside(b) && b.rect.bottom <= box.top + 2 && b.rect.left - 40 <= midX && b.rect.right + 40 >= midX && b.text.length <= 40)
    .sort((a, b) => b.rect.bottom - a.rect.bottom)[0];

  // The row: everything on the same line as the box's middle.
  const row = all
    .filter((b) => b.rect.top <= midY && b.rect.bottom >= midY)
    .sort((a, b) => a.rect.left - b.rect.left)
    .map((b) => b.text)
    .join(" | ");

  // The section: the closest heading above.
  const headings = [...document.querySelectorAll<HTMLElement>("h1, h2, h3, [role=heading]")].filter((h) => !h.closest("[data-companion]"));
  const section = headings
    .map((h) => ({ h, r: h.getBoundingClientRect() }))
    .filter(({ r }) => r.bottom <= box.top + 4 && r.width > 0)
    .sort((a, b) => b.r.bottom - a.r.bottom)[0]?.h.textContent?.trim();

  const text = pageText();
  const currencies = [...new Set([...text.matchAll(CURRENCY)].map((m) => m[1]))].slice(0, 6);
  return {
    column: column?.text.slice(0, 200) ?? "",
    row: row.slice(0, 600),
    section: (section ?? "").slice(0, 200),
    currencies,
    page_text: text,
  };
}

/** Which screen this is, as its title bar says it. */
export function pageName(): string {
  const title = document.querySelector("header h1")?.textContent?.trim();
  return (title || document.title || location.pathname).slice(0, 200);
}

/* ── what can be pressed ─────────────────────────────────────────────── */

const PRESSABLE =
  "button, a[href], [role=tab], [role=button], [role=menuitem], [role=switch], input:not([type=hidden]), select, textarea";

function labelOf(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent;
    const wrapping = el.closest("label")?.textContent;
    return (id || wrapping || el.getAttribute("placeholder") || el.name || "field").trim();
  }
  return (el.innerText || el.textContent || el.getAttribute("title") || "").trim();
}

/**
 * The things on screen a person could press or fill, tagged so a step can
 * point at one. Ids are fresh on every reading; an old id simply finds nothing.
 */
export function pressables(limit = 140): Pressable[] {
  document.querySelectorAll("[data-guide-id]").forEach((el) => el.removeAttribute("data-guide-id"));
  const out: Pressable[] = [];
  const seen = new Set<string>();
  let n = 0;
  for (const el of document.querySelectorAll<HTMLElement>(PRESSABLE)) {
    if (out.length >= limit) break;
    if (el.closest("[data-companion]")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const label = labelOf(el).replace(/\s+/g, " ").slice(0, 80);
    if (!label) continue;
    const kind =
      el.getAttribute("role") === "tab"
        ? "tab"
        : el.tagName === "A"
          ? "link"
          : el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
            ? "field"
            : "button";
    const key = `${kind}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = `g${++n}`;
    el.setAttribute("data-guide-id", id);
    out.push({ id, label, kind });
  }
  return out;
}

export function pressable(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-guide-id="${CSS.escape(id)}"]`);
}
