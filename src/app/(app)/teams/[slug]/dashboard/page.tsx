"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { RotateCcw, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { humanise } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { DashboardOut, LayoutOut, WidgetInfo } from "@/lib/types";
import { Badge, Panel, PageHead } from "@/components/ui/primitives";
import { Button, Toggle } from "@/components/ui/controls";
import { PanelSkeleton, ErrorState, InlineNotice, Modal } from "@/components/ui/feedback";
import { NoWidgets, Widget, WidgetGrid } from "@/components/widgets";

export default function TeamDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const session = useSession();
  const [configuring, setConfiguring] = useState(false);

  const dashboard = useSWR<DashboardOut>(`/teams/${slug}/dashboard`);

  if (dashboard.error) {
    return <ErrorState error={dashboard.error} onRetry={() => dashboard.mutate()} />;
  }

  const data = dashboard.data;
  const slow = data && data.meta.elapsed_ms > 3000;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<Link href={`/teams/${slug}`}>{data?.name ?? "Team"}</Link>}
        title="Dashboard"
        lead={
          data && !data.meta.configured
            ? "No layout has been saved, so this shows the default widgets for the modules this team holds."
            : undefined
        }
        actions={
          session.roles.is_admin && (
            <Button icon={Settings2} onClick={() => setConfiguring(true)}>
              Choose widgets
            </Button>
          )
        }
      />

      {Object.keys(data?.errors ?? {}).length > 0 && (
        <InlineNotice tone="warn">
          {Object.entries(data!.errors).map(([key, message]) => (
            <p key={key}>
              <strong>{humanise(key)}</strong>: {message}
            </p>
          ))}
        </InlineNotice>
      )}

      {!data ? (
        <WidgetGrid>
          {Array.from({ length: 6 }).map((_, i) => (
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

      {slow && (
        <p className="text-[12px] text-ink-4">
          Rendered in {(data!.meta.elapsed_ms / 1000).toFixed(1)}s — the slow cards read
          SharePoint or Entra live.
        </p>
      )}

      <ConfigureLayout
        slug={slug}
        open={configuring}
        onClose={() => setConfiguring(false)}
        onSaved={() => {
          setConfiguring(false);
          dashboard.mutate();
        }}
      />
    </div>
  );
}

/**
 * Which widgets this team's dashboard shows.
 *
 * The backend hands back both the current placements and the full catalogue of
 * what is available to this team, so the dialog is a straight edit of that
 * list. Order comes from the catalogue rather than being draggable — position
 * is a number the backend already assigns, and a drag handle would be a lot of
 * machinery for a list this short.
 */
function ConfigureLayout({
  slug,
  open,
  onClose,
  onSaved,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const layout = useSWR<LayoutOut>(open ? `/teams/${slug}/dashboard/layout` : null);
  const [enabled, setEnabled] = useState<Record<string, boolean> | null>(null);

  // Seed from the server exactly once per open.
  if (open && layout.data && enabled === null) {
    const seed: Record<string, boolean> = {};
    for (const widget of layout.data.available) {
      const placement = layout.data.widgets.find((w) => w.widget_key === widget.key);
      seed[widget.key] = placement
        ? placement.enabled
        : layout.data.configured
          ? false
          : widget.default;
    }
    setEnabled(seed);
  }

  const save = useAction(async () =>
    api.put(`/teams/${slug}/dashboard/layout`, {
      widgets: Object.entries(enabled ?? {}).map(([widget_key, on]) => ({
        widget_key,
        enabled: on,
      })),
    }),
  );

  const reset = useAction(async () => api.del(`/teams/${slug}/dashboard/layout`));

  function close() {
    setEnabled(null);
    onClose();
  }

  const byModule = new Map<string, WidgetInfo[]>();
  for (const widget of layout.data?.available ?? []) {
    const list = byModule.get(widget.module) ?? [];
    list.push(widget);
    byModule.set(widget.module, list);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="lg"
      title="Choose widgets"
      description="Only widgets from modules this team has been granted appear here."
      footer={
        <>
          <Button
            icon={RotateCcw}
            loading={reset.pending}
            onClick={async () => {
              if ((await reset.run()) !== undefined) {
                setEnabled(null);
                onSaved();
              }
            }}
          >
            Back to defaults
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="accent"
            loading={save.pending}
            disabled={!enabled}
            onClick={async () => {
              if ((await save.run()) !== undefined) {
                setEnabled(null);
                onSaved();
              }
            }}
          >
            Save layout
          </Button>
        </>
      }
    >
      <div className="space-y-5 pb-4">
        {(save.error || reset.error) && (
          <InlineNotice tone="danger">{save.error ?? reset.error}</InlineNotice>
        )}
        {!layout.data ? (
          <PanelSkeleton lines={5} />
        ) : layout.data.available.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            This team holds no modules that contribute widgets.
          </p>
        ) : (
          [...byModule.entries()].map(([module, widgets]) => (
            <Panel key={module} tone="inset" className="p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">
                {humanise(module)}
              </p>
              <div className="space-y-4">
                {widgets.map((widget) => (
                  <div key={widget.key} className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Toggle
                        checked={enabled?.[widget.key] ?? false}
                        onChange={(next) =>
                          setEnabled((current) => ({ ...current, [widget.key]: next }))
                        }
                        label={widget.title}
                        hint={widget.description}
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge>{widget.size}</Badge>
                        {widget.remote && <Badge tone="warn">Reads a remote system</Badge>}
                        {widget.default && <Badge tone="accent">On by default</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ))
        )}
      </div>
    </Modal>
  );
}
