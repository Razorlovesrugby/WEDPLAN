"use client";

import { useEffect, useRef, useState } from "react";

/** Desktop is shown at a readable fraction of 1280px; a phone nearly full size. */
export const PREVIEW_DEVICE = {
  phone: { width: 430, zoom: 0.9 },
  desktop: { width: 1280, zoom: 0.52 },
} as const;

export type PreviewDevice = keyof typeof PREVIEW_DEVICE;

/*
 * Shared by the site builder and the registry settings (spec 38), so there is
 * one implementation of "lay the page out at the real device width, then scale".
 */
/**
 * The preview, scaled.
 *
 * The iframe is laid out at the real device width and then transformed, so
 * the page inside it genuinely believes it is 430px or 1280px wide. Setting
 * the frame to the *scaled* width instead would show a 1280px layout's media
 * queries resolving at 666px, which is a preview of a page nobody will ever
 * see. The outer box takes the scaled size so the surrounding layout is not
 * pushed around by the untransformed element.
 *
 * The zoom is the device's preferred one, shrunk to fit when the column is
 * narrower than that — which on a phone it always is.
 */
export function PreviewFrame({
  device,
  iframeRef,
  src,
  onLoaded,
  children,
}: {
  device: PreviewDevice;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  src: string;
  onLoaded?: () => void;
  /** Laid over the frame — e.g. the site builder's drop zone. */
  children?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);

  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { width, zoom: preferred } = PREVIEW_DEVICE[device];
  // 40px is the wrapper's `px-5` gutters.
  const zoom = available && available > 40 ? Math.min(preferred, (available - 40) / width) : preferred;

  return (
    <div ref={wrap} className="flex justify-center px-5 pb-5">
      <div
        // `overflow: clip`, not `hidden`: a hidden box is still a scroll
        // container, and anything inside the iframe that asks its ancestors
        // to scroll can move it — which is how the preview used to collapse to
        // a strip (spec 28 §4.2). A clipped box cannot be scrolled at all.
        className="relative overflow-clip border border-line bg-white"
        // The visible box is the scaled size. Heights are viewport units and
        // a `calc`, not a measurement, so nothing here touches `window` —
        // this component server-renders as part of the page.
        style={{ width: width * zoom, height: "78vh" }}
      >
        <iframe
          ref={iframeRef}
          // No `key`: the frame is never remounted. An edit is a message
          // asking it to re-render where it stands (`PreviewBridge`).
          src={src}
          onLoad={onLoaded}
          title="Preview"
          style={{
            width,
            height: `calc(78vh / ${zoom})`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            border: 0,
          }}
        />
        {children}
      </div>
    </div>
  );
}
