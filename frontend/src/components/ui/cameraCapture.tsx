import {useRef, useState, useEffect} from "react";
import {
    Camera, ImagePlus, Trash2, Maximize2, X,
    ChevronLeft, ChevronRight, ImageOff
} from "lucide-react";

type Texts = {
    title?: string;
    takePhoto?: string;
    addPhoto?: string;
    replace?: string;
    remove?: string;
    remove_all?: string;
    view?: string;
    emptyPrimary?: string;
    emptySecondary?: string;
    close?: string;
    maxReached?: string;
    sizeLimitHit?: string;
    perFileLimitHit?: string;
    overflowNote?: string;
};

type Props = {
    id?: string;
    title?: string;
    label?: string;
    maxCount?: number;
    maxTotalBytes?: number;
    maxPerFileBytes?: number;
    allowSingleOverflow?: boolean;
    texts?: Texts;
    onChange?: (files: File[]) => void;
    onError?: (message: string) => void;
    jpegQuality?: number;     // 0..1
    jpegMaxEdge?: number;     // long-edge clamp in px
};

type Item = { file: File; url: string };

export default function PhotoCaptureCard({
                                             id = "cam",
                                             title = "Photo",
                                             label,
                                             maxCount = 1,
                                             maxTotalBytes,
                                             maxPerFileBytes,
                                             allowSingleOverflow = true,
                                             texts,
                                             onChange,
                                             onError,
                                             jpegQuality = 0.92,
                                             jpegMaxEdge,
                                         }: Props) {
    const t: Required<Texts> = {
        title: title,
        takePhoto: label ?? "Take Photo",
        addPhoto: "Add Photo",
        replace: "Replace",
        remove: "Remove",
        remove_all: "Clear",
        view: "View",
        emptyPrimary: "No photo captured",
        emptySecondary: "Tap to take a photo",
        close: "Close",
        maxReached: "Max photos reached",
        sizeLimitHit: "Total size limit reached",
        perFileLimitHit: "File exceeds per-file size limit",
        overflowNote: "Over size cap: add disabled; replace/remove only",
        ...(texts || {}),
    };

    const inputRef = useRef<HTMLInputElement>(null);
    const railRef = useRef<HTMLDivElement>(null);

    const [items, setItems] = useState<Item[]>([]);
    const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // ---------- Utilities ----------
    function safeBasename(name: string) {
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        return base && base.trim().length ? base : "image";
    }

    async function blobToFile(blob: Blob, name: string, type = "image/jpeg"): Promise<File> {
        return new File([blob], safeBasename(name) + ".jpg", {type});
    }

    function loadViaImageElement(file: File): Promise<HTMLImageElement> {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                res(img);
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                rej(e);
            };
            img.src = url;
        });
    }

    async function fileToJpeg(
        file: File,
        quality: number,
        maxEdge?: number
    ): Promise<File> {
        const src: any = (("createImageBitmap" in window) && (window as any).createImageBitmap)
            ? await createImageBitmap(file, {imageOrientation: "from-image"})
            : await loadViaImageElement(file);

        const sw = src.width, sh = src.height;
        let tw = sw, th = sh;
        if (maxEdge && Math.max(sw, sh) > maxEdge) {
            const k = maxEdge / Math.max(sw, sh);
            tw = Math.round(sw * k);
            th = Math.round(sh * k);
        }

        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d", {alpha: false});
        if (!ctx) throw new Error("2D context unavailable");

        // White background for transparent sources -> avoids black matte in JPEG
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, tw, th);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, 0, 0, tw, th);

        const blob: Blob = await new Promise((resolve) => {
            const toJpeg = () => canvas.toBlob((b) => b ? resolve(b) : requestAnimationFrame(toJpeg), "image/jpeg", quality);
            toJpeg();
        });

        try {
            src.close?.();
        } catch { /* ignore */
        }

        return blobToFile(blob, file.name);
    }

    const showError = (msg: string) => {
        setErr(msg);
        onError?.(msg);
        window.clearTimeout((showError as any)._t);
        (showError as any)._t = window.setTimeout(() => setErr(null), 3500);
    };

    // Revoke URLs on unmount
    const itemsRef = useRef<Item[]>([]);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);
    useEffect(() => () => {
        itemsRef.current.forEach(i => URL.revokeObjectURL(i.url));
    }, []);

    const totalBytes = (arr: Item[]) => arr.reduce((s, it) => s + it.file.size, 0);
    const emitChange = (next: Item[]) => {
        setItems(next);
        onChange?.(next.map(i => i.file));
    };

    // ---------- File handling (JPEG-first) ----------
    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        const mkItem = async (f: File): Promise<Item> => {
            const jf = await fileToJpeg(f, jpegQuality, jpegMaxEdge);
            return {file: jf, url: URL.createObjectURL(jf)};
        };

        // REPLACE path
        if (replaceIndex !== null) {
            const f = files[0];
            if (!f) return;
            try {
                const newItem = await mkItem(f);
                if (maxPerFileBytes && newItem.file.size > maxPerFileBytes) {
                    showError(t.perFileLimitHit);
                    setReplaceIndex(null);
                    if (inputRef.current) inputRef.current.value = "";
                    return;
                }
                const next = [...items];
                URL.revokeObjectURL(next[replaceIndex].url);
                next[replaceIndex] = newItem;
                setReplaceIndex(null);
                emitChange(next);
            } catch {
                showError("Conversion failed");
            }
            if (inputRef.current) inputRef.current.value = "";
            return;
        }

        // ADD path
        const remainingCount = Math.max(0, maxCount - items.length);
        if (remainingCount <= 0) {
            showError(t.maxReached);
            if (inputRef.current) inputRef.current.value = "";
            return;
        }

        const currTotal = maxTotalBytes ? totalBytes(items) : 0;
        const overflowActive = !!(maxTotalBytes && currTotal > maxTotalBytes);

        const picked = Array.from(files).slice(0, remainingCount);
        const added: Item[] = [];
        let usedOverflow = false;
        let rejectedPerFile = false;

        for (const f of picked) {
            try {
                const it = await mkItem(f);

                if (maxPerFileBytes && it.file.size > maxPerFileBytes) {
                    rejectedPerFile = true;
                    continue;
                }

                if (!maxTotalBytes) {
                    added.push(it);
                    continue;
                }

                const addedBytes = added.reduce((s, i) => s + i.file.size, 0);
                const wouldBe = currTotal + addedBytes + it.file.size;

                if (wouldBe <= maxTotalBytes) {
                    added.push(it);
                } else if (allowSingleOverflow && !overflowActive && !usedOverflow) {
                    added.push(it);
                    usedOverflow = true;
                    break; // stop after granting single overflow
                } else {
                    break; // cap reached; stop accepting more
                }
            } catch {
                // skip this file on conversion error
            }
        }

        if (added.length > 0) emitChange([...items, ...added]);
        if (rejectedPerFile) showError(t.perFileLimitHit);
        if (added.length === 0 && maxTotalBytes) {
            showError(overflowActive ? t.sizeLimitHit : t.maxReached);
        }

        if (inputRef.current) inputRef.current.value = "";
    };

    // ---------- UI handlers ----------
    const requestAdd = () => {
        setReplaceIndex(null);
        inputRef.current?.click();
    };
    const requestReplace = (i: number) => {
        setReplaceIndex(i);
        inputRef.current?.click();
    };
    const removeAt = (i: number) => {
        const next = [...items];
        const [rm] = next.splice(i, 1);
        if (rm) URL.revokeObjectURL(rm.url);
        emitChange(next);
    };

    const openViewer = (i: number) => setViewerIndex(i);
    const closeViewer = () => setViewerIndex(null);
    const prevViewer = () => setViewerIndex(i => (i === null ? i : (i - 1 + items.length) % items.length));
    const nextViewer = () => setViewerIndex(i => (i === null ? i : (i + 1) % items.length));

    const formatSize = (bytes: number): string => {
        const units = ["B", "KB", "MB", "GB", "TB"];
        let size = bytes;
        let unitIndex = 0;

        while (unitIndex < units.length - 1 && size >= 1000) {
            size /= 1024;
            unitIndex++;
        }

        const rounded = Math.round(size);
        const display =
            rounded < 10
                ? size.toFixed(1) // 1 decimal place for small numbers
                : rounded.toString();

        return `${display} ${units[unitIndex]}`;
    };

    const currTotal = totalBytes(items);
    const overflowActive = !!(maxTotalBytes && currTotal > maxTotalBytes);
    const atCountLimit = items.length >= maxCount;
    const blockAdd = atCountLimit || (!!maxTotalBytes && overflowActive);

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="font-medium text-neutral-900">{t.title}</div>
                <div className="flex items-center gap-2">
                    {items.length === 0 ? (
                        <button
                            type="button"
                            onClick={requestAdd}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#9512c4] text-white font-medium shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2"
                        >
                            <Camera className="h-5 w-5"/>
                            {t.takePhoto}
                        </button>
                    ) : !blockAdd ? (
                        <button
                            type="button"
                            onClick={requestAdd}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#9512c4] text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
                        >
                            <ImagePlus className="h-4 w-4"/>
                            {t.addPhoto}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled
                            onClick={requestAdd}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#dd9af5] text-white focus:outline-none focus:ring-2 focus:ring-offset-2"
                        >
                            <ImageOff className="h-4 w-4"/>
                            {t.addPhoto}
                        </button>
                    )}
                </div>
            </div>

            {/* Hidden input */}
            <input
                id={id}
                ref={inputRef}
                type="file"
                accept="image/*;capture=camera"
                capture="environment"
                multiple={!blockAdd && maxCount > 1}
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
            />

            {/* Error banner */}
            {err && (
                <div
                    className="mx-4 -mt-1 mb-2 rounded-md bg-red-50 text-red-700 text-xs px-3 py-2 ring-1 ring-red-200">
                    {err}
                </div>
            )}

            {/* Content */}
            <div className="px-4 pb-2">
                {/* Empty */}
                {items.length === 0 && (
                    <label
                        htmlFor={id}
                        onClick={(e) => {
                            e.preventDefault();
                            requestAdd();
                        }}
                        className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-neutral-50 ring-1 ring-neutral-200 cursor-pointer"
                        title={t.emptySecondary}
                    >
                        <div className="flex flex-col items-center gap-2 text-neutral-400">
                            <Camera className="h-8 w-8"/>
                            <p className="text-sm">{t.emptyPrimary}</p>
                        </div>
                    </label>
                )}

                {/* Single big */}
                {items.length === 1 && (
                    <div
                        className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-50 ring-1 ring-neutral-200">
                        <img src={items[0].url} alt="Preview 1" className="h-full w-full object-contain"/>
                        <div className="absolute right-2 top-2 flex gap-1">
                            <button
                                type="button"
                                onClick={() => openViewer(0)}
                                className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-white text-xs hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/60"
                            >
                                <Maximize2 className="h-3.5 w-3.5"/>
                                {t.view}
                            </button>
                            <button
                                type="button"
                                onClick={() => requestReplace(0)}
                                className="inline-flex items-center gap-1 rounded-md bg-[#9512c4] px-2 py-1 text-white text-xs focus:outline-none focus:ring-2 focus:ring-white/60"
                            >
                                <ImagePlus className="h-3.5 w-3.5"/>
                                {t.replace}
                            </button>
                            <button
                                type="button"
                                onClick={() => removeAt(0)}
                                className="inline-flex items-center gap-1 rounded-md bg-neutral-200 px-2 py-1 text-neutral-900 text-xs hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-white/60"
                            >
                                <Trash2 className="h-3.5 w-3.5"/>
                                {t.remove}
                            </button>
                        </div>
                        <div
                            className="absolute left-2 bottom-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
                            {items[0].file.name} · {formatSize(items[0].file.size)}
                        </div>
                    </div>
                )}

                {/* Horizontal rail */}
                {items.length >= 2 && (
                    <div className="relative">
                        <div
                            className="pointer-events-none absolute left-0 top-0 h-full w-6 bg-gradient-to-r from-white to-transparent rounded-l-xl"/>
                        <div
                            className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-white to-transparent rounded-r-xl"/>

                        <div
                            ref={railRef}
                            className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-1 py-1"
                            style={{scrollPaddingLeft: 16, scrollPaddingRight: 16}}
                            aria-label="Photos"
                        >
                            {items.map((it, idx) => (
                                <div
                                    key={idx}
                                    className="relative snap-start shrink-0 w-[242px] aspect-[4/3] overflow-hidden rounded-xl bg-neutral-50 ring-1 ring-neutral-200"
                                >
                                    <img src={it.url} alt={`Preview ${idx + 1}`}
                                         className="h-full w-full object-cover"/>
                                    <div className="absolute right-2 top-2 flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => openViewer(idx)}
                                            className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-white text-xs hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/60"
                                            aria-label={`${t.view} full size`}
                                        >
                                            <Maximize2 className="h-3.5 w-3.5"/>
                                            {t.view}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => requestReplace(idx)}
                                            className="inline-flex items-center gap-1 rounded-md bg-[#9512c4] px-2 py-1 text-white text-xs focus:outline-none focus:ring-2 focus:ring-white/60"
                                        >
                                            <ImagePlus className="h-3.5 w-3.5"/>
                                            {t.replace}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeAt(idx)}
                                            className="inline-flex items-center gap-1 rounded-md bg-neutral-200 px-2 py-1 text-neutral-900 text-xs hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-white/60"
                                        >
                                            <Trash2 className="h-3.5 w-3.5"/>
                                            {t.remove}
                                        </button>
                                    </div>
                                    <div
                                        className="absolute left-2 bottom-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
                                        {it.file.name} · {formatSize(it.file.size)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Summary */}
                <div className="px-4">
                    <div className="mt-2 flex items-center justify-between text-xs text-neutral-600">
                        <span className="truncate">{items.length} / {maxCount}</span>
                        <span className={overflowActive ? "text-amber-500 font-medium" : ""}>
              {formatSize(currTotal)}
                            {maxTotalBytes ? ` / ${formatSize(maxTotalBytes)} max` : ""}
            </span>
                    </div>
                </div>
            </div>

            {/* Viewer */}
            {viewerIndex !== null && items[viewerIndex] && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
                    onClick={closeViewer}
                >
                    <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={closeViewer}
                            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-white text-xs hover:bg-black/70"
                            aria-label="Close viewer"
                        >
                            <X className="h-3.5 w-3.5"/>
                            {t.close}
                        </button>
                        {items.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={prevViewer}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/70 focus:outline-none"
                                    aria-label="Previous"
                                >
                                    <ChevronLeft className="h-5 w-5"/>
                                </button>
                                <button
                                    type="button"
                                    onClick={nextViewer}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/70 focus:outline-none"
                                    aria-label="Next"
                                >
                                    <ChevronRight className="h-5 w-5"/>
                                </button>
                            </>
                        )}
                        <img
                            src={items[viewerIndex].url}
                            alt={`Preview ${viewerIndex + 1}`}
                            className="w-full h-auto rounded-lg"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
