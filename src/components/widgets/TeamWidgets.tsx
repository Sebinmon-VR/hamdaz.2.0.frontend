"use client";

import { humanise } from "@/lib/format";
import { useProgressive } from "@/lib/hooks";
import type { DashboardOut } from "@/lib/types";
import { ErrorState, InlineNotice, PanelSkeleton } from "@/components/ui/feedback";
import { NoWidgets, Widget, WidgetGrid } from "@/components/widgets";

/**
 * A team's dashboard cards, wherever they are being read.
 *
 * Extracted so the team page can show them in place rather than sending
 * somebody one hop further for the numbers they came for. The dashboard route
 * still exists — the access catalogue names it, and choosing which widgets a
 * team gets belongs on a screen of its own — but nobody has to visit it just
 * to look.
 *
 * The two-stage load is the reason this can sit on the team page at all.
 * `useProgressive` asks for the local half and the full answer together, so
 * the cards that come out of Postgres paint immediately and the ones reading
 * Entra and SharePoint — which are what make a team dashboard take seconds —
 * replace them when they land. Without that, embedding this would have made
 * the team page as slow as its slowest remote read.
 */
export function TeamWidgets({
  slug,
  /** Rendered beside nothing here; the caller owns the heading and actions. */
  compact = false,
}: {
  slug: string;
  compact?: boolean;
}) {
  const dashboard = useProgressive<DashboardOut>(`/teams/${slug}/dashboard`);

  if (dashboard.error) {
    return <ErrorState error={dashboard.error} onRetry={() => dashboard.mutate()} />;
  }

  const data = dashboard.data;
  const slow = data && data.meta.elapsed_ms > 3000;
  const errors = Object.entries(data?.errors ?? {});

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <InlineNotice tone="warn">
          {errors.map(([key, message]) => (
            <p key={key}>
              <strong>{humanise(key)}</strong>: {message}
            </p>
          ))}
        </InlineNotice>
      )}

      {dashboard.partial && data && (
        <p className="px-1 text-[11.5px] text-ink-4">
          Showing what is held locally — the cards that read Entra and SharePoint are still
          on their way.
        </p>
      )}

      {!data ? (
        <WidgetGrid>
          {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
            <div key={i} className="sm:col-span-6 xl:col-span-4">
              <PanelSkeleton />
            </div>
          ))}
        </WidgetGrid>
      ) : data.widgets.length === 0 ? (
        <NoWidgets slug={slug} />
      ) : (
        <WidgetGrid>
          {data.widgets.map((widget) => (
            <Widget key={widget.key} widget={widget} teamSlug={slug} />
          ))}
        </WidgetGrid>
      )}

      {slow && !compact && (
        <p className="text-[12px] text-ink-4">
          Rendered in {(data!.meta.elapsed_ms / 1000).toFixed(1)}s — the slow cards read
          SharePoint or Entra live.
        </p>
      )}
    </div>
  );
}
