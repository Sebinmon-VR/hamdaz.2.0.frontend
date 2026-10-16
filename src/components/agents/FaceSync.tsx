"use client";

import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { api } from "@/lib/api";
import { faceKeyOf, type Agent, type AvatarSpec } from "@/lib/agents";
import { AgentAvatar } from "@/components/agents/AgentAvatar";

/**
 * Agents' faces as pictures, for their Teams cards.
 *
 * A Teams card can only show an image it fetches from a public address, and
 * an agent's face is drawn here, live, as SVG. So the browser draws each face
 * once — still, at 256px — turns it into a PNG and hands it to the API, which
 * serves it to Teams. It is drawn again only when the avatar changes
 * (``faceKey``), and any viewer of their own agents does it in passing.
 */

const SIZE = 256;
/** Faces being drawn or sent now, so two pages do not both do it. */
const busy = new Set<string>();

async function drawFace(spec: AvatarSpec): Promise<Blob | null> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:256px;height:256px;pointer-events:none";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(AgentAvatar, { spec, size: SIZE, mood: "still" })));
    const svg = host.querySelector("svg");
    if (!svg) return null;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(SIZE));
    copy.setAttribute("height", String(SIZE));
    copy.removeAttribute("class");
    const markup = new XMLSerializer().serializeToString(copy);
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("face did not draw"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      canvas.getContext("2d")?.drawImage(image, 0, 0, SIZE, SIZE);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Saves a face for every agent whose saved one is missing or from an older avatar. */
export function useFaceSync(agents: Agent[]) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const agent of agents) {
        const key = faceKeyOf(agent.avatar);
        const job = `${agent.id}:${key}`;
        if (cancelled || agent.faceKey === key || busy.has(job)) continue;
        busy.add(job);
        try {
          const png = await drawFace(agent.avatar);
          if (!png || cancelled) continue;
          const form = new FormData();
          form.append("face", png, "face.png");
          form.append("key", key);
          await api.upload(`/agents/${agent.id}/face`, form);
        } catch {
          // A missing face only means a card without a picture; it is tried again next visit.
        } finally {
          busy.delete(job);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agents]);
}
