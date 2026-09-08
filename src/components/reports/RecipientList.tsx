"use client";

/**
 * A list of email addresses, added one at a time.
 *
 * A tag box rather than a comma-separated text field, for a reason the backend
 * makes plain: an entry without an "@" is **dropped on save rather than
 * refused**, so a typo in a comma-separated line would vanish silently and the
 * person who typed it would find out weeks later when somebody asked why they
 * were not getting the reports. Adding one at a time makes each address a thing
 * on screen that can be seen to be there, or seen not to be.
 *
 * The obvious mistakes are caught here too — no "@", or already in the list —
 * because saying so at the moment of typing is worth more than a server round
 * trip that quietly discards it.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Input } from "@/components/ui/controls";

export function RecipientList({
  addresses,
  onChange,
  placeholder = "someone@hamdaz.com",
  max = 50,
}: {
  addresses: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const entry = draft.trim().toLowerCase();
    if (!entry) return;
    if (!entry.includes("@")) {
      setError("That is not an address — it needs an @.");
      return;
    }
    if (addresses.includes(entry)) {
      setError("Already on the list.");
      return;
    }
    if (addresses.length >= max) {
      setError(`${max} is the most that can be added.`);
      return;
    }
    onChange([...addresses, entry]);
    setDraft("");
    setError(null);
  }

  return (
    <div>
      {addresses.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {addresses.map((address) => (
            <li
              key={address}
              className="inline-flex items-center gap-1.5 rounded-full bg-panel-2 py-1 pl-3 pr-1 text-[12px] text-ink-2"
            >
              <span className="max-w-[16rem] truncate">{address}</span>
              <button
                onClick={() => onChange(addresses.filter((entry) => entry !== address))}
                aria-label={`Remove ${address}`}
                className="grid size-5 place-items-center rounded-full text-ink-4 transition hover:bg-panel-3 hover:text-danger"
              >
                <X className="size-3" strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button size="sm" variant="ghost" icon={Plus} onClick={add}>
          Add
        </Button>
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}
