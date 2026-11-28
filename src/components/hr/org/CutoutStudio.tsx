"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Eraser, Hand, ImageUp, Paintbrush, RotateCcw, Undo2, X } from "lucide-react";
import {
  OUT_H,
  OUT_W,
  applyMask,
  autoFrame,
  canvas,
  cutOut,
  dab,
  hasTransparency,
  loadPhoto,
  maskFromAlpha,
  render,
  restore,
  snapshot,
  toBlob,
  type Frame,
  type Progress,
} from "@/lib/cutout";
import { RING, type OrgColour } from "@/lib/org";
import { FileDrop } from "@/components/ui/controls";
import { Btn, Note } from "@/components/payroll/ui";
import { Face } from "./Face";

type Tool = "move" | "erase" | "restore";
type Step = "pick" | "working" | "edit";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 15 * 1024 * 1024;
const EDITOR_BOX = { w: 560, h: 600 };
const UNDO_DEPTH = 8;

/**
 * The cut-out tool. HR picks a photo; the person is cut out on this computer;
 * the brush takes away anything left of the background (or puts back a lost
 * ear); zoom and drag set the framing. Save hands back the original file and
 * the 900 x 1200 cut-out, for the caller to upload together.
 */
export function CutoutStudio({
  name,
  colour,
  onClose,
  onSave,
}: {
  name: string;
  colour: OrgColour;
  onClose: () => void;
  onSave: (original: File, cutout: Blob) => Promise<boolean>;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("erase");
  const [brush, setBrush] = useState(28);
  const [zoom, setZoom] = useState(1);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const file = useRef<File | null>(null);
  const photo = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const cut = useRef<HTMLCanvasElement | null>(null);
  const auto = useRef<Frame | null>(null);
  const out = useRef<HTMLCanvasElement | null>(null);
  const undo = useRef<Uint8ClampedArray[]>([]);
  const view = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const run = useRef(0);

  /* the framing HR has set, on top of the automatic one */
  const frame = useCallback((): Frame | null => {
    const a = auto.current;
    if (!a) return null;
    // Zoom about the head, so it stays put while everything else grows.
    const px = OUT_W / 2;
    const py = 0.2 * OUT_H;
    return {
      scale: a.scale * zoom,
      x: px + (a.x - px) * zoom + shift.x,
      y: py + (a.y - py) * zoom + shift.y,
    };
  }, [zoom, shift]);

  /* the editor: the whole photo, faint where it has been cut away */
  const paintView = useCallback(() => {
    const v = view.current;
    const p = photo.current;
    const c = cut.current;
    if (!v || !p || !c) return;
    const g = v.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, v.width, v.height);
    g.globalAlpha = 0.22;
    g.drawImage(p, 0, 0, v.width, v.height);
    g.globalAlpha = 1;
    g.drawImage(c, 0, 0, v.width, v.height);
  }, []);

  const refreshPreview = useCallback(() => {
    const f = frame();
    if (!cut.current || !f) return;
    out.current = render(cut.current, f, out.current ?? undefined);
    setPreview(out.current.toDataURL("image/webp", 0.85));
  }, [frame]);

  useEffect(() => {
    if (step === "edit") refreshPreview();
  }, [step, refreshPreview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        doUndo();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doUndo reads refs only
  }, [onClose, saving]);

  async function take(files: File[]) {
    const f = files[0];
    if (!f) return;
    setError(null);
    setNote(null);
    if (!ACCEPT.split(",").includes(f.type)) {
      setError("Use a JPG, PNG or WebP photo.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That photo is over 15 MB. Use a smaller one.");
      return;
    }
    const mine = ++run.current;
    setStep("working");
    setProgress({ stage: "runtime" });
    try {
      const p = await loadPhoto(f);
      let m: HTMLCanvasElement;
      if (hasTransparency(p)) {
        m = maskFromAlpha(p);
        setNote("This photo already has a transparent background, so it is used as it is.");
      } else {
        m = await cutOut(p, (pr) => mine === run.current && setProgress(pr));
      }
      if (mine !== run.current) return;
      file.current = f;
      photo.current = p;
      mask.current = m;
      cut.current = applyMask(p, m);
      auto.current = autoFrame(m);
      undo.current = [];
      setUndoCount(0);
      setZoom(1);
      setShift({ x: 0, y: 0 });
      setStep("edit");
    } catch (e) {
      if (mine !== run.current) return;
      setError(e instanceof Error ? e.message : "The cut-out did not work.");
      setStep("pick");
    }
  }

  /* size the editor canvas to the photo, inside its box */
  useEffect(() => {
    if (step !== "edit" || !view.current || !photo.current) return;
    const p = photo.current;
    const k = Math.min(EDITOR_BOX.w / p.width, EDITOR_BOX.h / p.height);
    view.current.width = Math.round(p.width * k);
    view.current.height = Math.round(p.height * k);
    paintView();
  }, [step, paintView]);

  function toPhoto(e: ReactPointerEvent<HTMLCanvasElement>) {
    const v = view.current!;
    const r = v.getBoundingClientRect();
    const p = photo.current!;
    return { x: ((e.clientX - r.left) / r.width) * p.width, y: ((e.clientY - r.top) / r.height) * p.height, k: p.width / r.width };
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }, k: number) {
    const m = mask.current;
    if (!m || tool === "move") return;
    const radius = brush * k;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (radius / 3)));
    for (let i = 1; i <= steps; i += 1) {
      dab(m, from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, radius, tool);
    }
    cut.current = applyMask(photo.current!, m, cut.current ?? undefined);
    paintView();
  }

  function onDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (tool === "move" || !mask.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    undo.current = [...undo.current.slice(-(UNDO_DEPTH - 1)), snapshot(mask.current)];
    setUndoCount(undo.current.length);
    const at = toPhoto(e);
    drawing.current = at;
    stroke(at, at, at.k);
  }

  function onMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const at = toPhoto(e);
    stroke(drawing.current, at, at.k);
    drawing.current = at;
  }

  function onUp() {
    if (!drawing.current) return;
    drawing.current = null;
    refreshPreview();
  }

  function doUndo() {
    const last = undo.current.pop();
    if (!last || !mask.current || !photo.current) return;
    restore(mask.current, last);
    cut.current = applyMask(photo.current, mask.current, cut.current ?? undefined);
    setUndoCount(undo.current.length);
    paintView();
    refreshPreview();
  }

  /* dragging the big preview moves the person in the frame */
  const dragFrom = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const BIG = 168;
  const framePerPx = OUT_H / (BIG * 1.34);

  async function save() {
    const f = frame();
    if (!file.current || !cut.current || !f) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await toBlob(render(cut.current, f, canvas(OUT_W, OUT_H)));
      if (await onSave(file.current, blob)) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the photo.");
    } finally {
      setSaving(false);
    }
  }

  const pct = progress?.fraction != null ? Math.round(progress.fraction * 100) : null;

  // Straight onto <body>, like the person drawer it opens from (which is portalled there too): rendered
  // in place it sat inside the page's own stacking context and came up behind the drawer.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`Photo for ${name}`}>
      <div className="flex max-h-full w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Photo for {name}</p>
            <p className="text-[12px] text-ink-3">
              The cut-out is made on this computer. Nothing is uploaded until you press Save.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-3 hover:bg-panel-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === "pick" && (
            <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_16rem]">
              <FileDrop
                onFiles={take}
                accept={ACCEPT}
                label="Choose a photo, or drop it here"
                hint="JPG, PNG or WebP, up to 15 MB"
                className="min-h-56"
              />
              <div className="space-y-2 text-[12.5px] text-ink-3">
                <p className="font-medium text-ink-2">For the best cut-out</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Head and shoulders, facing the camera.</li>
                  <li>Good light, and a plain wall behind if you can.</li>
                  <li>Nothing in front of the person.</li>
                </ul>
                <p>A PNG that is already cut out is used as it is.</p>
              </div>
              {error && (
                <div className="md:col-span-2">
                  <Note tone="danger">{error}</Note>
                </div>
              )}
            </div>
          )}

          {step === "working" && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
              <div className="h-1.5 w-64 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={clsx("h-full rounded-full bg-accent transition-[width] duration-200", pct == null && "w-1/3 animate-pulse")}
                  style={pct != null ? { width: `${pct}%` } : undefined}
                />
              </div>
              <p className="text-[13px] font-medium text-ink">
                {progress?.stage === "model"
                  ? `Downloading the cut-out model, first time only${pct != null ? ` · ${pct}%` : ""}`
                  : progress?.stage === "cutting"
                    ? "Cutting out…"
                    : "Starting the cut-out tool…"}
              </p>
              <p className="max-w-sm text-[12px] text-ink-4">
                The model is about 25 MB. After the first time it is kept in this browser.
              </p>
            </div>
          )}

          {step === "edit" && (
            <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ToolBtn on={tool === "erase"} icon={Eraser} onClick={() => setTool("erase")}>
                    Erase
                  </ToolBtn>
                  <ToolBtn on={tool === "restore"} icon={Paintbrush} onClick={() => setTool("restore")}>
                    Put back
                  </ToolBtn>
                  <ToolBtn on={tool === "move"} icon={Hand} onClick={() => setTool("move")}>
                    Look only
                  </ToolBtn>
                  <label className="ml-1 flex items-center gap-2 text-[12px] text-ink-3">
                    Brush
                    <input type="range" min={6} max={80} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-24 accent-[var(--color-accent)]" />
                  </label>
                  <span className="ml-auto flex gap-1">
                    <Btn type="button" icon={Undo2} disabled={!undoCount} onClick={doUndo}>
                      Undo
                    </Btn>
                    <Btn type="button" icon={ImageUp} onClick={() => setStep("pick")}>
                      Other photo
                    </Btn>
                  </span>
                </div>
                <div
                  className="flex items-center justify-center rounded-lg border border-line p-2"
                  style={{
                    minHeight: 320,
                    backgroundColor: "#fff",
                    backgroundImage:
                      "linear-gradient(45deg,#e9e9ee 25%,transparent 25%),linear-gradient(-45deg,#e9e9ee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e9e9ee 75%),linear-gradient(-45deg,transparent 75%,#e9e9ee 75%)",
                    backgroundSize: "18px 18px",
                    backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
                  }}
                >
                  <canvas
                    ref={view}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    className={clsx("max-w-full touch-none", tool === "move" ? "cursor-default" : "cursor-crosshair")}
                    style={{ height: "auto" }}
                  />
                </div>
                <p className="text-[12px] text-ink-4">
                  Faint parts are what the cut-out left out. Erase anything of the background that is still
                  there; Put back restores what was cut by mistake. Ctrl+Z undoes a stroke.
                </p>
                {note && <Note>{note}</Note>}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-line bg-[#f2f1ed] px-4 pb-4 pt-12">
                  <div
                    className="flex cursor-grab justify-center active:cursor-grabbing"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragFrom.current = { x: e.clientX, y: e.clientY, sx: shift.x, sy: shift.y };
                    }}
                    onPointerMove={(e) => {
                      const d = dragFrom.current;
                      if (!d) return;
                      setShift({ x: d.sx + (e.clientX - d.x) * framePerPx, y: d.sy + (e.clientY - d.y) * framePerPx });
                    }}
                    onPointerUp={() => {
                      dragFrom.current = null;
                      refreshPreview();
                    }}
                    title="Drag to move"
                  >
                    <Face src={preview} name={name} colour={colour} size={BIG} gap="#f2f1ed" />
                  </div>
                  <p className="mt-3 text-center text-[11.5px] text-ink-4">On the chart · drag the face to move it</p>
                </div>
                <label className="block text-[12px] text-ink-3">
                  <span className="mb-1 flex justify-between">
                    <span>Zoom</span>
                    <button type="button" className="text-ink-4 hover:text-ink" onClick={() => { setZoom(1); setShift({ x: 0, y: 0 }); }}>
                      <RotateCcw className="mr-1 inline size-3" />
                      Reset
                    </button>
                  </span>
                  <input type="range" min={0.6} max={1.8} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
                </label>
                <div className="flex items-end gap-4 rounded-lg p-3" style={{ background: "#050d18" }}>
                  <div className="relative h-36 flex-1 overflow-hidden rounded-md" style={{ background: `radial-gradient(70% 80% at 60% 40%, ${RING[colour]}55, transparent 70%), #050d18` }}>
                    {preview && (
                      // eslint-disable-next-line @next/next/no-img-element -- a local preview
                      <img src={preview} alt="" className="absolute bottom-0 left-1/2 h-[135%] max-w-none -translate-x-1/2" />
                    )}
                    <span className="absolute left-2 top-2 text-[10.5px] text-white/60">Profile page</span>
                  </div>
                  <div className="pb-1 text-center">
                    <Face src={preview} name={name} colour={colour} size={40} gap="#050d18" />
                    <p className="mt-2 text-[10.5px] text-white/60">Strip</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          {error && step === "edit" && <span className="text-[12px] text-danger">{error}</span>}
          <span className="ml-auto flex gap-2">
            <Btn type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Btn>
            <Btn type="button" variant="accent" loading={saving} disabled={step !== "edit"} onClick={save}>
              Save photo
            </Btn>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ToolBtn({
  on,
  icon: Icon,
  onClick,
  children,
}: {
  on: boolean;
  icon: typeof Eraser;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
        on ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-3 hover:bg-panel-2 hover:text-ink",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}
