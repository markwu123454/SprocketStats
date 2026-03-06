import { useState, useRef, useEffect } from "react";
import { Share2, Maximize, Download, Printer, X, ChevronLeft, CheckSquare, Square, Layers, FileImage, FileText } from "lucide-react";
import { toPng } from "html-to-image";
import QRCodeStyling from "qr-code-styling";
import { jsPDF } from "jspdf";
import { useAPI } from "@/hooks/useAPI.ts";

type GuestAdminInfo = {
    password: string
    name: string
    perms: {
        team: string[]
        match: string[]
        ranking: boolean
        alliance: boolean
    }
    created_at: string | null
}

type AppMode = "select-guest" | "share-actions" | "fullscreen" | "capture"
type PageTab = "share" | "batch"
type BatchTheme = "dark" | "light"
type CaptureTheme = "dark" | "light"
type OutputFormat = "png" | "pdf"

export default function AdminSharePage() {
    const { getAllGuest } = useAPI()
    const [guests, setGuests] = useState<GuestAdminInfo[]>([])

    // --- Share tab state ---
    const [selectedGuest, setSelectedGuest] = useState<GuestAdminInfo | null>(null)
    const [finalPassword, setFinalPassword] = useState<string | null>(null)
    const [appMode, setAppMode] = useState<AppMode>("select-guest")
    const [guestQuery, setGuestQuery] = useState("")
    const [guestOpen, setGuestOpen] = useState(false)
    const [captureTheme, setCaptureTheme] = useState<CaptureTheme>("dark")
    const [shareFormat, setShareFormat] = useState<OutputFormat>("png")

    // --- Batch tab state ---
    const [pageTab, setPageTab] = useState<PageTab>("share")
    const [batchQuery, setBatchQuery] = useState("")
    const [selectedPasswords, setSelectedPasswords] = useState<Set<string>>(new Set())
    const [batchTheme, setBatchTheme] = useState<BatchTheme>("dark")
    const [batchFormat, setBatchFormat] = useState<OutputFormat>("pdf")
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
    const [batchGuest, setBatchGuest] = useState<GuestAdminInfo | null>(null)

    const qrRef = useRef<HTMLDivElement | null>(null)
    const qr = useRef<QRCodeStyling | null>(null)
    const shareCardRef = useRef<HTMLDivElement | null>(null)

    const guestUrl = "https://sprocketstats.com/guest"
    const activeGuest = batchGuest ?? selectedGuest
    const activePassword = batchGuest?.password ?? finalPassword
    const fullLink = activePassword ? `${guestUrl}?pw=${activePassword}` : guestUrl

    const filteredGuests = guests.filter(g =>
        g.name.toLowerCase().includes(guestQuery.toLowerCase())
    )
    const filteredBatchGuests = guests.filter(g =>
        g.name.toLowerCase().includes(batchQuery.toLowerCase())
    )

    useEffect(() => {
        getAllGuest().then(setGuests).catch(console.error)
    }, [])

    // ── QR code effect ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!activePassword) return
        if (!qrRef.current) return

        const gearLogo = "/static/sprocket_logo_gear.png"
        const isLight = appMode === "capture" ? captureTheme === "light" : batchTheme === "light"

        if (!qr.current) {
            qr.current = new QRCodeStyling({
                width: 240, height: 240, type: "svg",
                data: fullLink,
                dotsOptions: { color: "#000000", type: "rounded" },
                backgroundOptions: { color: "transparent" },
                image: gearLogo,
                imageOptions: { crossOrigin: "anonymous", imageSize: 0.35, margin: 0 },
                cornersSquareOptions: { type: "extra-rounded" },
                cornersDotOptions: { type: "dot" },
            })
        } else {
            qr.current.update({ data: fullLink, image: gearLogo })
        }

        qrRef.current.innerHTML = ""
        qr.current.append(qrRef.current)
    }, [activePassword, appMode, fullLink, captureTheme, batchTheme])

    // ── Helpers ─────────────────────────────────────────────────────────────
    const resetShare = () => {
        setSelectedGuest(null)
        setFinalPassword(null)
        setAppMode("select-guest")
        setGuestQuery("")
    }

    const handleShare = async () => {
        if (!fullLink) return
        if (navigator.share) {
            try {
                await navigator.share({ title: "Sprocket Guest Access", text: `Guest portal link:\n${fullLink}`, url: fullLink })
                return
            } catch { /* empty */ }
        }
        navigator.clipboard.writeText(fullLink)
    }

    const goFullscreen = () => {
        const root = document.documentElement
        if (root.requestFullscreen) void root.requestFullscreen()
        else if ((root as any).webkitRequestFullscreen) (root as any).webkitRequestFullscreen()
        setAppMode("fullscreen")
    }

    const exitFullscreen = () => {
        if (document.exitFullscreen) void document.exitFullscreen()
        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen()
        setAppMode("share-actions")
    }

    const captureCardDataUrl = async (): Promise<string> => {
        await new Promise(r => setTimeout(r, 400))
        if (!shareCardRef.current) return ""
        return toPng(shareCardRef.current, { cacheBust: true, pixelRatio: 1.5 })
    }

    const addImageToPdf = (pdf: jsPDF, url: string) => {
        const PW = pdf.internal.pageSize.getWidth()
        const PH = pdf.internal.pageSize.getHeight()
        pdf.addImage(url, "PNG", 0, 0, PW, PH)
    }

    const triggerDownload = async (isLight: boolean) => {
        setCaptureTheme(isLight ? "light" : "dark")
        setAppMode("capture")
        const dataUrl = await captureCardDataUrl()
        const baseName = `guest-access-${selectedGuest?.name ?? "card"}${isLight ? "-light" : ""}`
        if (shareFormat === "pdf") {
            const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" })
            addImageToPdf(pdf, dataUrl)
            pdf.save(`${baseName}.pdf`)
        } else {
            const link = document.createElement("a")
            link.download = `${baseName}.png`
            link.href = dataUrl
            link.click()
        }
        setAppMode("share-actions")
    }

    // ── Batch download ───────────────────────────────────────────────────────
    const handleBatchDownload = async () => {
        const toDownload = guests.filter(g => selectedPasswords.has(g.password))
        if (toDownload.length === 0) return
        const isLight = batchTheme === "light"
        const suffix = isLight ? "-light" : ""

        if (batchFormat === "pdf") {
            const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" })

            for (let i = 0; i < toDownload.length; i++) {
                setBatchProgress({ current: i + 1, total: toDownload.length })
                setBatchGuest(toDownload[i])
                setCaptureTheme(isLight ? "light" : "dark")
                setAppMode("capture")

                const url = await captureCardDataUrl()
                if (!url) continue

                if (i > 0) pdf.addPage()
                addImageToPdf(pdf, url)
            }

            setBatchGuest(null)
            setBatchProgress(null)
            setAppMode("select-guest")
            pdf.save(`guest-cards-batch${suffix}.pdf`)

        } else {
            for (let i = 0; i < toDownload.length; i++) {
                setBatchProgress({ current: i + 1, total: toDownload.length })
                const guest = toDownload[i]
                setBatchGuest(guest)
                setCaptureTheme(isLight ? "light" : "dark")
                setAppMode("capture")

                const url = await captureCardDataUrl()
                if (url) {
                    const link = document.createElement("a")
                    link.download = `guest-access-${guest.name}${suffix}.png`
                    link.href = url
                    link.click()
                    await new Promise(r => setTimeout(r, 150))
                }
            }

            setBatchGuest(null)
            setBatchProgress(null)
            setAppMode("select-guest")
        }
    }

    const toggleGuest = (pw: string) => {
        setSelectedPasswords(prev => {
            const next = new Set(prev)
            next.has(pw) ? next.delete(pw) : next.add(pw)
            return next
        })
    }

    const selectAll = () => setSelectedPasswords(new Set(filteredBatchGuests.map(g => g.password)))
    const deselectAll = () => setSelectedPasswords(new Set())
    const allSelected = filteredBatchGuests.length > 0 && filteredBatchGuests.every(g => selectedPasswords.has(g.password))

    // ── Card renderer ────────────────────────────────────────────────────────
    const renderShareView = (isLight = false) => (
        <>
            <div className="absolute inset-0 opacity-30 pointer-events-none">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="hexagons" x="0" y="0" width="50" height="86.6" patternUnits="userSpaceOnUse">
                            <polygon points="25,0 50,14.43 50,43.3 25,57.74 0,43.3 0,14.43" fill="none"
                                     stroke={isLight ? "rgba(0,0,0,0.15)" : "rgba(168,85,247,0.4)"} strokeWidth="1"/>
                            <polygon points="50,43.3 75,57.74 75,86.6 50,100.04 25,86.6 25,57.74" fill="none"
                                     stroke={isLight ? "rgba(0,0,0,0.15)" : "rgba(168,85,247,0.4)"} strokeWidth="1"/>
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#hexagons)"/>
                </svg>
            </div>

            <div className="w-full h-full flex flex-col justify-center items-center text-center relative overflow-hidden">
                <div className={`absolute top-6 left-6 w-24 h-24 border-t-4 border-l-4 rounded-tl-3xl ${isLight ? 'border-gray-300' : 'border-purple-500/30'}`}></div>
                <div className={`absolute top-6 right-6 w-24 h-24 border-t-4 border-r-4 rounded-tr-3xl ${isLight ? 'border-gray-300' : 'border-purple-500/30'}`}></div>
                <div className={`absolute bottom-6 left-6 w-24 h-24 border-b-4 border-l-4 rounded-bl-3xl ${isLight ? 'border-gray-300' : 'border-purple-500/30'}`}></div>
                <div className={`absolute bottom-6 right-6 w-24 h-24 border-b-4 border-r-4 rounded-br-3xl ${isLight ? 'border-gray-300' : 'border-purple-500/30'}`}></div>

                <div className="relative z-10 w-full max-w-6xl">
                    <div className="mb-4 flex flex-col items-center">
                        <div className="relative w-30 h-30 mb-2">
                            <img src="/static/sprocket_logo_ring.png" alt="Team Sprocket Ring"
                                 className="absolute inset-0 w-full h-full object-contain animate-spin-slow"
                                 style={{ animationDuration: '20s', filter: isLight ? 'brightness(0)' : 'brightness(0) invert(1)' }}/>
                            <img src="/static/sprocket_logo_gear.png" alt="Team Sprocket Gear"
                                 className="absolute inset-0 w-full h-full object-contain"
                                 style={{ filter: isLight ? 'brightness(0)' : 'brightness(0) invert(1)' }}/>
                        </div>
                        <h2 className={`text-3xl md:text-4xl font-bold mb-2 ${isLight ? 'text-black' : 'bg-linear-to-r from-purple-200 via-purple-100 to-purple-200 bg-clip-text text-transparent print:bg-none print:text-white print:[-webkit-text-fill-color:#ffffff]'}`}>
                            Welcome, {activeGuest?.name}!
                        </h2>
                        <p className={`text-lg font-medium tracking-wide ${isLight ? 'text-gray-600' : 'text-purple-400'}`}>
                            From Team 3473
                        </p>
                    </div>

                    <div className={`max-w-3xl mx-auto mb-6 text-lg leading-relaxed ${isLight ? 'text-gray-700' : 'text-purple-200'}`}>
                        <p className={isLight ? 'text-gray-700' : 'text-purple-300'}>
                            Team 3473 is sharing scouting data to support upcoming match planning and alliance coordination.
                        </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-10 items-center justify-center w-full">
                        <div className="flex flex-col items-center">
                            <div className={`p-8 rounded-3xl flex justify-center items-center relative group ${isLight ? 'bg-white border-2 border-gray-200 shadow-sm' : 'bg-white shadow-2xl'}`}
                                 style={{ width: "min(280px, 60vw)", height: "280px" }}>
                                {!isLight && (
                                    <div className="absolute inset-0 bg-linear-to-br from-purple-500/20 to-pink-500/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                                )}
                                <div className="relative z-10" ref={qrRef}></div>
                            </div>
                            <div className={`mt-4 flex items-center gap-2 ${isLight ? 'text-gray-600' : 'text-purple-300'}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
                                </svg>
                                <span className="font-semibold text-lg">Scan to Access</span>
                            </div>
                        </div>

                        <div className="w-full max-w-md text-left">
                            <div className="mb-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className={`w-5 h-5 ${isLight ? 'text-gray-500' : 'text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                                    </svg>
                                    <p className={`text-xl font-semibold ${isLight ? 'text-gray-700' : 'text-purple-300'}`}>Login Page</p>
                                </div>
                                <div className={`p-4 border-2 rounded-2xl text-lg backdrop-blur-sm shadow-lg ${isLight ? 'bg-gray-50 border-gray-300' : 'bg-linear-to-br from-purple-950/60 to-purple-900/40 border-purple-600/50'}`}>
                                    <span className={`truncate font-mono ${isLight ? 'text-black' : 'text-purple-100'}`}>{guestUrl}</span>
                                </div>
                            </div>

                            <div className="mb-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className={`w-5 h-5 ${isLight ? 'text-gray-500' : 'text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                                    </svg>
                                    <p className={`text-xl font-semibold ${isLight ? 'text-gray-700' : 'text-purple-300'}`}>Password</p>
                                </div>
                                <div className={`p-4 border-2 rounded-2xl text-lg backdrop-blur-sm shadow-lg ${isLight ? 'bg-gray-50 border-gray-300' : 'bg-linear-to-br from-purple-950/60 to-purple-900/40 border-purple-600/50'}`}>
                                    <span className={`truncate font-mono tracking-wide ${isLight ? 'text-black' : 'text-purple-100'}`}>{activePassword}</span>
                                </div>
                            </div>

                            <div className={`flex items-start gap-3 text-sm leading-relaxed p-4 rounded-xl border ${isLight ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-purple-950/30 border-purple-700/30 text-purple-200'}`}>
                                <svg className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-gray-500' : 'text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <div>
                                    <p className="mb-2">Navigate to the link above and enter the password to access the shared scouting data.</p>
                                    <p className={`text-xs flex items-center gap-1.5 ${isLight ? 'text-gray-500' : 'text-purple-300'}`}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                        </svg>
                                        Dashboard optimized for tablets and desktop
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`mt-8 pt-6 mx-12 border-t text-sm ${isLight ? 'border-gray-300 text-gray-500' : 'border-purple-700/30 text-purple-400'}`}>
                        <p className="mb-1">Questions? Contact any Team 3473 pit crew or strategy lead</p>
                        <p className={`text-xs ${isLight ? 'text-gray-400' : 'text-purple-500'}`}>Powered by SprocketStats</p>
                    </div>
                </div>
            </div>
        </>
    )

    // ── Render ───────────────────────────────────────────────────────────────

    // Fullscreen overlay
    if (appMode === "fullscreen") {
        return (
            <div className="absolute inset-0 overflow-auto p-8" style={{ backgroundColor: '#462784' }}>
                <button
                    onClick={exitFullscreen}
                    className="absolute top-4 right-4 z-50 bg-purple-800/80 hover:bg-purple-700 text-white rounded-full p-2 transition"
                    aria-label="Exit fullscreen"
                >
                    <X className="w-5 h-5"/>
                </button>
                {renderShareView(false)}
            </div>
        )
    }

    // Hidden capture target (both share single + batch)
    if (appMode === "capture") {
        const isLight = captureTheme === "light"
        return (
            <div className="min-h-screen bg-purple-950 flex flex-col items-center justify-center text-purple-100">
                {/* Progress overlay for batch */}
                {batchProgress && (
                    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-purple-950/90 gap-4">
                        <Layers className="w-10 h-10 text-purple-400 animate-pulse"/>
                        <p className="text-xl font-semibold text-purple-200">
                            Downloading {batchProgress.current} of {batchProgress.total}…
                        </p>
                        <div className="w-64 h-2 bg-purple-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-purple-400 rounded-full transition-all duration-300"
                                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                            />
                        </div>
                        <p className="text-purple-400 text-sm">{batchGuest?.name}</p>
                    </div>
                )}
                <div ref={shareCardRef} className="absolute inset-0 p-8"
                     style={{
                         backgroundColor: isLight ? '#ffffff' : '#462784',
                         // Force landscape letter ratio (11:8.5) so the captured image
                         // maps 1:1 onto the PDF page with no stretching or letterboxing
                         position: 'fixed',
                         top: 0, left: 0,
                         width: '1100px',
                         height: '850px',
                         overflow: 'hidden',
                     }}>
                    {renderShareView(isLight)}
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col bg-linear-to-b from-purple-950 via-purple-900 to-purple-950 text-purple-100">

            {/* ── Tab bar ── */}
            <div className="flex justify-center pt-8 pb-2 gap-2">
                <button
                    onClick={() => setPageTab("share")}
                    className={`px-6 py-2 rounded-xl text-sm font-semibold transition ${pageTab === "share" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}
                >
                    Share
                </button>
                <button
                    onClick={() => setPageTab("batch")}
                    className={`px-6 py-2 rounded-xl text-sm font-semibold transition ${pageTab === "batch" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}
                >
                    Batch Download
                </button>
            </div>

            {/* ══════════════════════════════════════════════════
                SHARE TAB
            ══════════════════════════════════════════════════ */}
            {pageTab === "share" && (
                <>
                    {/* Step 1 — Guest selection */}
                    {appMode === "select-guest" && (
                        <div className="flex flex-col items-center mt-24 px-4">
                            <h1 className="text-3xl font-bold mb-6 text-white">Select Guest</h1>
                            <div className="relative w-full max-w-md">
                                <input
                                    type="text"
                                    value={guestQuery}
                                    placeholder="Search guest name…"
                                    onFocus={() => setGuestOpen(true)}
                                    onChange={(e) => { setGuestQuery(e.target.value); setGuestOpen(true) }}
                                    onBlur={() => setTimeout(() => setGuestOpen(false), 100)}
                                    className="w-full bg-purple-900/40 border border-purple-700 rounded-xl px-4 py-3 text-purple-100 placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                {guestOpen && filteredGuests.length > 0 && (
                                    <ul className="absolute z-20 mt-2 w-full bg-purple-950 border border-purple-700 rounded-xl max-h-60 overflow-y-auto scrollbar-purple">
                                        {filteredGuests.map((guest) => (
                                            <li
                                                key={guest.password}
                                                onMouseDown={() => {
                                                    setSelectedGuest(guest)
                                                    setFinalPassword(guest.password)
                                                    setGuestQuery(guest.name)
                                                    setGuestOpen(false)
                                                    setAppMode("share-actions")
                                                }}
                                                className="px-4 py-3 cursor-pointer hover:bg-purple-800/50 text-purple-200"
                                            >
                                                {guest.name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2 — Actions */}
                    {appMode === "share-actions" && (
                        <main className="flex flex-col items-center mt-16 px-4">
                            {/* Back button */}
                            <button
                                onClick={resetShare}
                                className="self-start ml-4 mb-6 flex items-center gap-1 text-purple-400 hover:text-purple-200 transition text-sm"
                            >
                                <ChevronLeft className="w-4 h-4"/>
                                Change Guest
                            </button>

                            <h1 className="text-3xl font-bold mb-1">Guest Share Tools</h1>
                            <p className="text-purple-400 mb-6">Sharing for <span className="text-purple-200 font-semibold">{selectedGuest?.name}</span></p>

                            {/* Format toggle */}
                            <div className="w-full max-w-md mb-6">
                                <p className="text-purple-400 text-sm mb-2">Download format</p>
                                <div className="flex gap-2">
                                    <button onClick={() => setShareFormat("png")}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition ${shareFormat === "png" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}>
                                        <FileImage className="w-4 h-4"/> PNG
                                    </button>
                                    <button onClick={() => setShareFormat("pdf")}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition ${shareFormat === "pdf" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}>
                                        <FileText className="w-4 h-4"/> PDF
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4 w-full max-w-md">
                                <button onClick={goFullscreen}
                                    className="flex items-center gap-3 bg-purple-800/60 hover:bg-purple-700 transition px-5 py-3 rounded-xl text-lg">
                                    <Maximize className="w-5 h-5"/> Full Screen
                                </button>

                                <button onClick={() => triggerDownload(false)}
                                    className="flex items-center gap-3 bg-purple-800/60 hover:bg-purple-700 transition px-5 py-3 rounded-xl text-lg">
                                    <Download className="w-5 h-5"/> Save Dark ({shareFormat.toUpperCase()})
                                </button>

                                <button onClick={() => triggerDownload(true)}
                                    className="flex items-center gap-3 bg-purple-800/60 hover:bg-purple-700 transition px-5 py-3 rounded-xl text-lg">
                                    <Printer className="w-5 h-5"/> Save Ink-Friendly Light ({shareFormat.toUpperCase()})
                                </button>

                                <button onClick={handleShare}
                                    className="flex items-center gap-3 bg-purple-800/60 hover:bg-purple-700 transition px-5 py-3 rounded-xl text-lg">
                                    <Share2 className="w-5 h-5"/> Share Link
                                </button>
                            </div>
                        </main>
                    )}
                </>
            )}

            {/* ══════════════════════════════════════════════════
                BATCH DOWNLOAD TAB
            ══════════════════════════════════════════════════ */}
            {pageTab === "batch" && (
                <div className="flex flex-col items-center mt-12 px-4 w-full max-w-lg mx-auto">
                    <h1 className="text-3xl font-bold mb-2 text-white">Batch Download</h1>
                    <p className="text-purple-400 text-sm mb-6">Select guests to download cards for</p>

                    {/* Search */}
                    <input
                        type="text"
                        value={batchQuery}
                        placeholder="Filter guests…"
                        onChange={(e) => setBatchQuery(e.target.value)}
                        className="w-full bg-purple-900/40 border border-purple-700 rounded-xl px-4 py-3 text-purple-100 placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-3"
                    />

                    {/* Select all / deselect all */}
                    <div className="flex items-center justify-between w-full mb-2 px-1">
                        <span className="text-purple-400 text-sm">{selectedPasswords.size} selected</span>
                        <button
                            onClick={allSelected ? deselectAll : selectAll}
                            className="text-sm text-purple-300 hover:text-white transition flex items-center gap-1"
                        >
                            {allSelected
                                ? <><CheckSquare className="w-4 h-4"/> Deselect all</>
                                : <><Square className="w-4 h-4"/> Select all</>
                            }
                        </button>
                    </div>

                    {/* Guest list */}
                    <ul className="w-full bg-purple-950/60 border border-purple-700 rounded-xl max-h-72 overflow-y-auto mb-6">
                        {filteredBatchGuests.length === 0 && (
                            <li className="px-4 py-4 text-purple-500 text-sm text-center">No guests found</li>
                        )}
                        {filteredBatchGuests.map((guest) => {
                            const checked = selectedPasswords.has(guest.password)
                            return (
                                <li
                                    key={guest.password}
                                    onClick={() => toggleGuest(guest.password)}
                                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition border-b border-purple-800/40 last:border-0 ${checked ? 'bg-purple-800/40' : 'hover:bg-purple-800/20'}`}
                                >
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition ${checked ? 'bg-purple-500 border-purple-500' : 'border-purple-600'}`}>
                                        {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                                        </svg>}
                                    </div>
                                    <span className="text-purple-200">{guest.name}</span>
                                    {guest.created_at && (
                                        <span className="ml-auto text-purple-500 text-xs">
                                            {new Date(guest.created_at).toLocaleDateString()}
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </ul>

                    {/* Theme toggle */}
                    <div className="w-full mb-4">
                        <p className="text-purple-400 text-sm mb-2">Card theme</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setBatchTheme("dark")}
                                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${batchTheme === "dark" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}
                            >
                                Dark
                            </button>
                            <button
                                onClick={() => setBatchTheme("light")}
                                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${batchTheme === "light" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}
                            >
                                Light (Ink-Friendly)
                            </button>
                        </div>
                    </div>

                    {/* Format toggle */}
                    <div className="w-full mb-6">
                        <p className="text-purple-400 text-sm mb-2">Output format</p>
                        <div className="flex gap-2">
                            <button onClick={() => setBatchFormat("pdf")}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition ${batchFormat === "pdf" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}>
                                <FileText className="w-4 h-4"/> PDF <span className="text-xs opacity-70">(1 file, 1 page each)</span>
                            </button>
                            <button onClick={() => setBatchFormat("png")}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition ${batchFormat === "png" ? "bg-purple-600 text-white" : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"}`}>
                                <FileImage className="w-4 h-4"/> PNG <span className="text-xs opacity-70">(separate files)</span>
                            </button>
                        </div>
                    </div>

                    {/* Download button */}
                    <button
                        onClick={handleBatchDownload}
                        disabled={selectedPasswords.size === 0}
                        className="w-full flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition px-5 py-3 rounded-xl text-lg font-semibold"
                    >
                        <Download className="w-5 h-5"/>
                        {selectedPasswords.size === 0
                            ? "Select guests to download"
                            : batchFormat === "pdf"
                                ? `Download PDF (${selectedPasswords.size} page${selectedPasswords.size !== 1 ? "s" : ""})`
                                : `Download ${selectedPasswords.size} PNG${selectedPasswords.size !== 1 ? "s" : ""}`
                        }
                    </button>
                </div>
            )}
        </div>
    )
}