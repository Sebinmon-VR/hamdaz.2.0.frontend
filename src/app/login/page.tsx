"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { API_ROOT, beginSignIn } from "@/lib/api";
import { Button } from "@/components/ui/controls";
import { InlineNotice } from "@/components/ui/feedback";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";
import { Wordmark } from "@/components/shell/Wordmark";

/**
 * Sign-in.
 *
 * A door, not a landing page. Everyone who reaches it already works here and
 * already knows what the tool is, so there is nothing to sell — the whole job
 * is one button and a clear account of anything that went wrong.
 *
 * The button is a full-page navigation to the backend, not a fetch: the
 * backend owns the Entra round trip, and the PKCE verifier, nonce and return
 * path all ride in a cookie it sets along the way.
 */

/** What the backend can send back in ?error=, in words that suggest a fix. */
const REASONS: Record<string, string> = {
  expired_login:
    "The sign-in took too long, or this page was opened from a stale bookmark. Starting again should work.",
  state_mismatch:
    "The sign-in did not come back to the browser that started it. Start again in a single tab.",
  sign_in_failed: "Microsoft rejected the sign-in. The details are in the API log.",
  account_disabled:
    "This account has been deactivated in Hamdaz. An administrator can reactivate it.",
  missing_code: "Microsoft returned here without an authorisation code.",
  access_denied: "The sign-in was cancelled, or consent was refused.",
};

function LoginScreen() {
  const params = useSearchParams();
  const error = params.get("error");
  const next = params.get("next");
  const [going, setGoing] = useState(false);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-between">
          <Wordmark />
          <ThemeSwitch />
        </div>

        <div className="rounded-[14px] border border-line bg-panel p-6 shadow-[var(--shadow-panel)]">
          <h1 className="text-[16px] font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
            Use your Hamdaz work account. There is no separate password for this
            application.
          </p>

          {error && (
            <InlineNotice tone="danger" className="mt-4">
              {REASONS[error] ?? `Sign-in failed: ${error}.`}
            </InlineNotice>
          )}

          <Button
            variant="accent"
            size="lg"
            icon={ArrowRight}
            loading={going}
            className="mt-5 w-full"
            onClick={() => {
              setGoing(true);
              beginSignIn(next ?? "/dashboard");
            }}
          >
            Continue with Microsoft
          </Button>

          <p className="mt-4 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-4">
            What you can see afterwards depends on the teams you belong to. If a module is
            missing, ask an administrator to grant it to your team.
          </p>
        </div>

        {/* The one thing worth showing an internal user here: which backend they
            are about to authenticate against. Pointing at the wrong one is the
            most common cause of a login that appears to do nothing. */}
        <p className="mt-3 text-center font-mono text-[11px] text-ink-4">{API_ROOT}</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-sunken" />}>
      <LoginScreen />
    </Suspense>
  );
}
