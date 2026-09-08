"use client";

import { Fragment, type ReactNode } from "react";

/**
 * The assistant's answer, as something readable.
 *
 * The model is told to answer briefly and in plain language, and it does — but
 * "short lists for several items" means it writes markdown, and rendering that
 * verbatim puts asterisks and backticks in front of people.
 *
 * This is a small renderer rather than a dependency, and deliberately so. The
 * whole grammar the model actually produces is paragraphs, bullets, numbered
 * lists, bold, inline code and the occasional fence — a few dozen lines to
 * cover, against a library that would arrive with an HTML sanitiser and the
 * question of whether it is configured correctly. Nothing here ever produces
 * HTML: every branch returns React elements, so a tool result echoing markup
 * back through an answer is text and can never be anything else.
 *
 * Unsupported syntax is left as the characters that were written. A table comes
 * out as its pipes, which is ugly and honest; inventing a table renderer for
 * output that is told to prefer lists would be building for a case that does
 * not arise.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-2.5">{blocks(text)}</div>;
}

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // A fence. Everything to the closing fence is verbatim — this is the one
    // block where the characters are the content.
    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        <pre
          key={key++}
          className="no-bar overflow-x-auto rounded-[13px] bg-panel-2 px-3.5 py-3 text-[12px] leading-relaxed"
        >
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(
        <p key={key++} className="text-[13.5px] font-semibold text-ink">
          {inline(heading[2])}
        </p>,
      );
      i++;
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-[7px] size-1 shrink-0 rounded-full bg-accent"
              />
              <span className="min-w-0 flex-1">{inline(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++} className="space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="tnum mt-px shrink-0 text-[11.5px] font-bold text-ink-4">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">{inline(item)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // A paragraph runs to the next blank line or the next block that starts
    // one of its own, so a list immediately under a sentence is still a list.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```") &&
      !/^#{1,6}\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="leading-relaxed">
        {inline(paragraph.join(" "))}
      </p>,
    );
  }

  return out;
}

/**
 * Bold, italic, inline code and links, in one pass.
 *
 * One combined pattern rather than four sequential replacements, because
 * running them in sequence lets an earlier rule rewrite text that a later one
 * then matches inside — the classic failure being a URL containing an
 * underscore turning into an italic halfway through the link.
 */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\n]+\*)/g;

function inline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];

    if (token.startsWith("`")) {
      out.push(
        <code
          key={key++}
          className="rounded-md bg-panel-2 px-1.5 py-px text-[0.92em] text-ink-2"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={key++} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      // Only http(s) is followed. Anything else — javascript:, data: — is
      // rendered as its own text, which is the safe reading of a link whose
      // scheme this app has no reason to trust.
      if (link && /^https?:\/\//i.test(link[2])) {
        out.push(
          <a
            key={key++}
            href={link[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-text underline underline-offset-2"
          >
            {link[1]}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else {
      out.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = at + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}
