import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const FIXED_MIME = "image/jpeg" as const;

export type EditParams = {
  // crop in SOURCE (bitmap) pixels
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  quality: number;   // 0..1
  maxEdge: number;   // long edge limit for output
  mime: typeof FIXED_MIME; // always jpeg
};

export type EditorModalProps = {
  file: File;                         // ORIGINAL
  initial?: Partial<EditParams>;      // previous params to restore
  onCancel: () => void;
  onSave: (out: File, params: EditParams) => void;
  title?: string;
};

type Handle = "tl" | "tr" | "bl" | "br" | null;

const HANDLE_VISIBLE = 12;   // what you SEE
const HANDLE_HITBOX  = 28;   // what you can CLICK (bigger)

export default function EditorModal({
  file, initial, onCancel, onSave, title = "Edit photo",
}: EditorModalProps) {
  // ---- params (refs for persistence across re-renders)
  const quality = useRef<number>(clamp01(initial?.quality ?? 0.82));
  const maxEdge = useRef<number>(initial?.maxEdge ?? 1600);
  const crop = useRef<{x:number;y:number;w:number;h:number}|null>(null); // source pixels

  // ---- UI state
  const [uiQuality, setUiQuality] = useState<number>(quality.current);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [compPreview, setCompPreview] = useState<ImageBitmap | null>(null);
  const [estBytes, setEstBytes] = useState<number | null>(null);

  // preview canvas metrics (contain-fit)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fit = useRef<{pw:number;ph:number; ix:number;iy:number;iw:number;ih:number; scale:number} | null>(null);

  // interaction
  const dragging = useRef<boolean>(false);
  const resizing = useRef<Handle>(null);
  const lastPos = useRef<{x:number;y:number}|null>(null);

  // estimate debounce
  const estimateTimer = useRef<number | null>(null);

  // ---- load original
  useEffect(() => {
    let url: string | null = null;
    (async () => {
      try { setBitmap(await createImageBitmap(file)); }
      catch {
        url = URL.createObjectURL(file);
        const img = new Image(); img.decoding = "async"; img.src = url;
        await img.decode(); setBitmap(await createImageBitmap(img));
      }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [file]);

  // ---- initialize crop to prior params or full image
  useEffect(() => {
    if (!bitmap) return;
    if (!crop.current) {
      const prior = initial;
      if (prior && isValidCrop(prior, bitmap)) {
        crop.current = { x: prior.cropX!, y: prior.cropY!, w: prior.cropW!, h: prior.cropH! };
      } else {
        crop.current = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
      }
    }
    // compute initial estimate immediately
    scheduleEstimate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

  // ---- draw preview (either compressed preview or live)
  const drawPreview = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    if (!bitmap || !crop.current) return;

    // contain-fit image into a preview canvas
    const PW = 800; // fixed preview width for clarity
    const scale = Math.min(PW / bitmap.width, PW / bitmap.height);
    const iw = Math.round(bitmap.width * scale);
    const ih = Math.round(bitmap.height * scale);
    const ix = Math.floor((PW - iw) / 2);
    const iy = Math.floor((Math.round(PW * (ih/iw)) ? 0 : 0)); // not used, we set height by image
    const PH = ih + 0; // canvas height = fitted image height

    c.width = PW; c.height = PH;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0,0,PW,PH);

    // draw fitted image
    ctx.drawImage(bitmap, ix, iy, iw, ih);

    // store fit metrics (for pointer mapping)
    fit.current = { pw: PW, ph: PH, ix, iy, iw, ih, scale };

    // draw crop overlay from SOURCE->PREVIEW mapping
    const r = crop.current;
    const rx = Math.round(ix + r.x * scale);
    const ry = Math.round(iy + r.y * scale);
    const rw = Math.round(r.w * scale);
    const rh = Math.round(r.h * scale);

    // darken outside
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.rect(0, 0, PW, PH);
    ctx.rect(rx, ry, rw, rh);
    ctx.fill("evenodd");

    // border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx+1, ry+1, Math.max(0, rw-2), Math.max(0, rh-2));

    // handles
    drawHandle(ctx, rx, ry);
    drawHandle(ctx, rx+rw, ry);
    drawHandle(ctx, rx, ry+rh);
    drawHandle(ctx, rx+rw, ry+rh);
    ctx.restore();

    // if we have a compressed preview, draw it inside the crop (for artifact preview)
    if (compPreview) {
      // compPreview is the final cropped+scaled output; fit it into the crop box
      ctx.drawImage(compPreview, rx, ry, rw, rh);
      // re-draw border/handles on top
      ctx.save();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.strokeRect(rx+1, ry+1, Math.max(0, rw-2), Math.max(0, rh-2));
      drawHandle(ctx, rx, ry);
      drawHandle(ctx, rx+rw, ry);
      drawHandle(ctx, rx, ry+rh);
      drawHandle(ctx, rx+rw, ry+rh);
      ctx.restore();
    }
  };

  useEffect(drawPreview, [bitmap, compPreview, uiQuality]);

  // ---- pointer helpers
  const hitHandle = (px:number, py:number): Handle => {
  if (!fit.current || !crop.current) return null;
  const s = fit.current.scale, { ix, iy } = fit.current;
  const r = crop.current;
  const hx = [ix + r.x * s, ix + (r.x + r.w) * s];
  const hy = [iy + r.y * s, iy + (r.y + r.h) * s];

  const hit = (x:number,y:number) =>
    px >= x - HANDLE_HITBOX/2 && px <= x + HANDLE_HITBOX/2 &&
    py >= y - HANDLE_HITBOX/2 && py <= y + HANDLE_HITBOX/2;

  if (hit(hx[0], hy[0])) return "tl";
  if (hit(hx[1], hy[0])) return "tr";
  if (hit(hx[0], hy[1])) return "bl";
  if (hit(hx[1], hy[1])) return "br";
  return null;
};


  const insideCrop = (px:number, py:number) => {
    if (!fit.current || !crop.current) return false;
    const s = fit.current.scale, { ix, iy } = fit.current;
    const r = crop.current;
    const rx = ix + r.x * s, ry = iy + r.y * s, rw = r.w * s, rh = r.h * s;
    return px >= rx && px <= rx+rw && py >= ry && py <= ry+rh;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!fit.current || !crop.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const h = hitHandle(px, py);
    if (h) { resizing.current = h; dragging.current = false; }
    else if (insideCrop(px, py)) { dragging.current = true; resizing.current = null; }
    else { dragging.current = false; resizing.current = null; }

    lastPos.current = { x: px, y: py };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!fit.current || !crop.current || !lastPos.current) return;
    const rectEl = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rectEl.left;
    const py = e.clientY - rectEl.top;
    const dx = px - lastPos.current.x;
    const dy = py - lastPos.current.y;
    lastPos.current = { x: px, y: py };

    const s = fit.current.scale;
    const inv = 1 / s;
    const imgW = bitmap!.width, imgH = bitmap!.height;

    const MIN = 16; // min crop in source pixels
    const r = crop.current;

    if (dragging.current) {
      // move
      r.x = clamp(r.x + dx*inv, 0, imgW - r.w);
      r.y = clamp(r.y + dy*inv, 0, imgH - r.h);
      setCompPreview(null);
      drawPreview();
      scheduleEstimate();
      return;
    }

    if (resizing.current) {
      // resize from corner
      const moveLeft = (amount:number) => {
        const nx = clamp(r.x + amount*inv, 0, r.x + r.w - MIN);
        r.w = r.w + (r.x - nx); r.x = nx;
      };
      const moveTop = (amount:number) => {
        const ny = clamp(r.y + amount*inv, 0, r.y + r.h - MIN);
        r.h = r.h + (r.y - ny); r.y = ny;
      };
      const moveRight = (amount:number) => {
        r.w = clamp(r.w + amount*inv, MIN, imgW - r.x);
      };
      const moveBottom = (amount:number) => {
        r.h = clamp(r.h + amount*inv, MIN, imgH - r.y);
      };

      if (resizing.current === "tl") { moveLeft(dx); moveTop(dy); }
      if (resizing.current === "tr") { moveRight(dx); moveTop(dy); }
      if (resizing.current === "bl") { moveLeft(dx); moveBottom(dy); }
      if (resizing.current === "br") { moveRight(dx); moveBottom(dy); }

      // clamp inside image
      r.x = clamp(r.x, 0, imgW - r.w);
      r.y = clamp(r.y, 0, imgH - r.h);

      setCompPreview(null);
      drawPreview();
      scheduleEstimate();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragging.current = false; resizing.current = null; lastPos.current = null;
  };

  // ---- render (crop + scale + compress) for save/estimate
  const renderOutput = async (): Promise<Blob> => {
    if (!bitmap || !crop.current) throw new Error("No bitmap");
    const r = crop.current;

    // output size: downscale so long edge <= maxEdge, never upscale
    const longSrc = Math.max(r.w, r.h);
    const scale = Math.min(1, maxEdge.current / longSrc);
    const outW = Math.max(1, Math.round(r.w * scale));
    const outH = Math.max(1, Math.round(r.h * scale));

    const out = document.createElement("canvas");
    out.width = outW; out.height = outH;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";

    // draw cropped region
    ctx.drawImage(
      bitmap,
      r.x, r.y, r.w, r.h,    // source crop (source pixels)
      0, 0, outW, outH       // dest
    );

    const blob: Blob = await new Promise((res) =>
      out.toBlob((b) => res(b as Blob), FIXED_MIME, uiQuality)
    );
    return blob;
  };

  // ---- estimate + compressed preview (debounced)
  const scheduleEstimate = (immediate=false) => {
    if (estimateTimer.current) window.clearTimeout(estimateTimer.current);
    const run = async () => {
      try {
        const blob = await renderOutput();
        setEstBytes(blob.size);
        const bm = await createImageBitmap(blob);
        setCompPreview(bm);
        drawPreview();
      } catch { /* ignore */ }
    };
    if (immediate) run();
    else estimateTimer.current = window.setTimeout(run, 160) as unknown as number;
  };

  // quality change → re-estimate
  useEffect(() => { scheduleEstimate(); }, [uiQuality]);

  // ---- save
  const save = async () => {
    quality.current = uiQuality;
    const blob = await renderOutput();
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    const out = new File([blob], name, { type: FIXED_MIME });
    const r = crop.current!;
    onSave(out, {
      cropX: Math.round(r.x), cropY: Math.round(r.y),
      cropW: Math.round(r.w), cropH: Math.round(r.h),
      quality: quality.current, maxEdge: maxEdge.current, mime: FIXED_MIME
    });
  };

  const fmtBytes = (n: number) => n >= 1024*1024 ? `${Math.round(n/(1024*1024))} MB` : `${Math.round(n/1024)} KB`;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog" aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-3xl rounded-xl bg-white p-4 shadow-lg"
        onClick={(e)=>e.stopPropagation()}
      >
        <div className="mb-2 text-sm font-medium text-neutral-900">{title}</div>
        <button type="button" onClick={onCancel}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-neutral-200 px-2 py-1 text-xs">
          <X className="h-3.5 w-3.5" /> Close
        </button>

        {/* Crop canvas */}
        <div className="relative mx-auto w-full max-w-2xl select-none touch-none rounded-md bg-neutral-900">
          <canvas
            ref={canvasRef}
            className="w-full h-auto block rounded-md"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>

        {/* Controls */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm flex items-center gap-2">
            Quality
            <input
              type="range" min={0} max={1} step={0.01} value={uiQuality}
              onChange={(e)=> setUiQuality(parseFloat(e.target.value))}
              className="w-full"
            />
            <span className="tabular-nums text-xs">{Math.round(uiQuality*100)}%</span>
          </label>

          <div className="text-xs text-neutral-600 self-center">
            {estBytes != null ? <>Estimated output: <span className="tabular-nums">{fmtBytes(estBytes)}</span></> : "Estimating…"}
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md bg-neutral-200 px-3 py-1.5 text-sm">Cancel</button>
          <button type="button" onClick={save} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function clamp(n:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, n)); }
function clamp01(n:number){ return clamp(n, 0, 1); }
function isValidCrop(p: Partial<EditParams>, bm: ImageBitmap){
  const ok = (v: any) => typeof v === "number" && isFinite(v) && v >= 0;
  return ok(p.cropX) && ok(p.cropY) && ok(p.cropW) && ok(p.cropH) &&
         (p!.cropX! + p!.cropW! <= bm.width + 0.5) &&
         (p!.cropY! + p!.cropH! <= bm.height + 0.5) &&
         p!.cropW! >= 1 && p!.cropH! >= 1;
}

function drawHandle(ctx: CanvasRenderingContext2D, x:number, y:number){
  ctx.save();
  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x - HANDLE_VISIBLE/2, y - HANDLE_VISIBLE/2, HANDLE_VISIBLE, HANDLE_VISIBLE);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
