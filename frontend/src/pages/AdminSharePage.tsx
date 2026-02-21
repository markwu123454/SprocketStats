import {useState, useRef, useEffect} from "react";
import {Share2, Maximize, Printer} from "lucide-react";
import QRCodeStyling from "qr-code-styling";
import {useAPI} from "@/hooks/useAPI.ts";

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


export default function AdminSharePage() {
    const {getAllGuest} = useAPI()
    const [guests, setGuests] = useState<GuestAdminInfo[]>([])
    const [selectedGuest, setSelectedGuest] = useState<GuestAdminInfo | null>(null)
    const [finalPassword, setFinalPassword] = useState<string | null>(null);
    const [mode, setMode] = useState<"normal" | "fullscreen" | "print">("normal");
    const [guestQuery, setGuestQuery] = useState("");
    const [guestOpen, setGuestOpen] = useState(false);

    const qrRef = useRef<HTMLDivElement | null>(null);
    const qr = useRef<QRCodeStyling | null>(null);

    const guestUrl = "https://sprocketstats.com/guest";
    const fullLink = finalPassword ? `${guestUrl}?pw=${finalPassword}` : guestUrl;

    const filteredGuests = guests.filter(g =>
        g.name.toLowerCase().includes(guestQuery.toLowerCase())
    );

    useEffect(() => {
        getAllGuest().then(setGuests).catch(console.error)
    }, [])


    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Sprocket Guest Access",
                    text: `Guest portal link:\n${fullLink}`,
                    url: fullLink
                });
                return;
            } catch { /* empty */
            }
        }
        navigator.clipboard.writeText(fullLink);
    };

    const triggerPrint = () => {
        setMode("print");
        setTimeout(() => window.print(), 300);
    };

    const goFullscreen = () => {
        const root = document.documentElement;

        if (root.requestFullscreen) {
            void root.requestFullscreen();
        } else if ((root as any).webkitRequestFullscreen) {
            (root as any).webkitRequestFullscreen();
        }

        setMode("fullscreen");
    };


    const renderShareView = () => (
        <>
            {/* Hexagon Background Pattern */}
            <div className="absolute inset-0 opacity-30 pointer-events-none">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="hexagons" x="0" y="0" width="50" height="86.6" patternUnits="userSpaceOnUse">
                            <polygon points="25,0 50,14.43 50,43.3 25,57.74 0,43.3 0,14.43" fill="none"
                                     stroke="rgba(168, 85, 247, 0.4)" strokeWidth="1"/>
                            <polygon points="50,43.3 75,57.74 75,86.6 50,100.04 25,86.6 25,57.74" fill="none"
                                     stroke="rgba(168, 85, 247, 0.4)" strokeWidth="1"/>
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#hexagons)"/>
                </svg>
            </div>

            <div
                className="w-full h-full flex flex-col justify-center items-center text-center relative overflow-hidden">


                {/* Decorative corner accents */}
                <div
                    className="absolute top-6 left-6 w-24 h-24 border-t-4 border-l-4 border-purple-500/30 rounded-tl-3xl"></div>
                <div
                    className="absolute top-6 right-6 w-24 h-24 border-t-4 border-r-4 border-purple-500/30 rounded-tr-3xl"></div>
                <div
                    className="absolute bottom-6 left-6 w-24 h-24 border-b-4 border-l-4 border-purple-500/30 rounded-bl-3xl"></div>
                <div
                    className="absolute bottom-6 right-6 w-24 h-24 border-b-4 border-r-4 border-purple-500/30 rounded-br-3xl"></div>

                {/* Content wrapper with gradient border */}
                <div className="relative z-10 w-full max-w-6xl">

                    {/* Header with logo and gradient text */}
                    <div className="mb-6 flex flex-col items-center">
                        {/* Logo */}
                        <div className="relative w-20 h-20 mb-4">
                            <img
                                src="/static/sprocket_logo_ring.png"
                                alt="Team Sprocket Ring"
                                className="absolute inset-0 w-full h-full object-contain animate-spin-slow"
                                style={{animationDuration: '20s', filter: 'brightness(0) invert(1)'}}
                            />
                            <img
                                src="/static/sprocket_logo_gear.png"
                                alt="Team Sprocket Gear"
                                className="absolute inset-0 w-full h-full object-contain"
                                style={{filter: 'brightness(0) invert(1)'}}
                            />
                        </div>

                        <h2
                            className="text-5xl md:text-6xl font-bold mb-2
                            bg-linear-to-r from-purple-200 via-purple-100 to-purple-200 bg-clip-text text-transparent
                            print:bg-none print:text-white print:[-webkit-text-fill-color:#ffffff]"
                        >
                            Welcome, {selectedGuest?.name}!
                        </h2>
                        <p className="text-purple-400 text-lg font-medium tracking-wide">
                            From Team 3473
                        </p>
                    </div>

                    {/* Intro Message */}
                    <div className="max-w-3xl mx-auto mb-8 text-purple-200 text-lg leading-relaxed">
                        <p className="text-purple-300">
                            Team 3473 is sharing scouting data to support upcoming match planning and alliance
                            coordination.
                        </p>
                    </div>

                    {/* Side-by-side layout */}
                    <div className="flex flex-col md:flex-row gap-10 items-center justify-center w-full">

                        {/* QR Code Box */}
                        <div className="flex flex-col items-center">
                            <div
                                className="bg-white p-8 rounded-3xl shadow-2xl flex justify-center items-center relative group"
                                style={{width: "min(280px, 60vw)", height: "280px"}}
                            >
                                {/* Glow effect */}
                                <div
                                    className="absolute inset-0 bg-linear-to-br from-purple-500/20 to-pink-500/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                                <div className="relative z-10" ref={qrRef}></div>
                            </div>
                            {/* QR Label */}
                            <div className="mt-4 flex items-center gap-2 text-purple-300">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
                                </svg>
                                <span className="font-semibold text-lg">Scan to Access</span>
                            </div>
                        </div>

                        {/* URL + Password Panel */}
                        <div className="w-full max-w-md text-left">

                            {/* URL */}
                            <div className="mb-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor"
                                         viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                                    </svg>
                                    <p className="text-purple-300 text-xl font-semibold">Login Page</p>
                                </div>
                                <div
                                    className="bg-linear-to-br from-purple-950/60 to-purple-900/40 p-4 border-2 border-purple-600/50 rounded-2xl text-lg backdrop-blur-sm shadow-lg">
                                    <span className="truncate text-purple-100 font-mono">{guestUrl}</span>
                                </div>
                            </div>

                            {/* Password */}
                            <div className="mb-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor"
                                         viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                                    </svg>
                                    <p className="text-purple-300 text-xl font-semibold">Password</p>
                                </div>
                                <div
                                    className="bg-linear-to-br from-purple-950/60 to-purple-900/40 p-4 border-2 border-purple-600/50 rounded-2xl text-lg backdrop-blur-sm shadow-lg">
                                <span
                                    className="truncate text-purple-100 font-mono tracking-wide">{finalPassword}</span>
                                </div>
                            </div>

                            {/* Instructions with small screen warning */}
                            <div
                                className="flex items-start gap-3 text-purple-200 text-sm leading-relaxed bg-purple-950/30 p-4 rounded-xl border border-purple-700/30">
                                <svg className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" fill="none"
                                     stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <div>
                                    <p className="mb-2">
                                        Navigate to the link above and enter the password to access the shared scouting
                                        data.
                                    </p>
                                    <p className="text-purple-300 text-xs flex items-center gap-1.5">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                        </svg>
                                        Dashboard optimized for tablets and desktop
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 pt-6 mx-12 border-t border-purple-700/30 text-purple-400 text-sm">
                        <p className="mb-1">Questions? Contact any Team 3473 pit crew or strategy lead</p>
                        <p className="text-purple-500 text-xs">Powered by SprocketStats</p>
                    </div>
                </div>
            </div>
        </>
    );

    useEffect(() => {
        if (!finalPassword) return;
        if (!qrRef.current) return;

        const gearLogo = "/static/sprocket_logo_gear.png";

        // Create or update QR code
        if (!qr.current) {
            qr.current = new QRCodeStyling({
                width: 240,
                height: 240,
                type: "svg",
                data: fullLink,

                // ⭐ MAKE DOTS CIRCULAR
                dotsOptions: {
                    color: "#000000",
                    type: "rounded"
                },

                backgroundOptions: {
                    color: "transparent"
                },

                // ⭐ CENTER IMAGE (GEAR)
                image: gearLogo,
                imageOptions: {
                    crossOrigin: "anonymous",
                    imageSize: 0.35, // fraction of QR area
                    margin: 0
                },

                // ⭐ CIRCULAR BORDER RING
                cornersSquareOptions: {
                    type: "extra-rounded"
                },
                cornersDotOptions: {
                    type: "dot"
                },


            });
        } else {
            qr.current.update({
                data: fullLink,
                image: gearLogo,
            });
        }

        // Render the QR code into the container
        qrRef.current.innerHTML = "";
        qr.current.append(qrRef.current);

    }, [finalPassword, mode, fullLink]);

    return (
        <div
            className={`min-h-screen flex flex-col bg-linear-to-b from-purple-950 via-purple-900 to-purple-950 text-purple-100`}>

            {/* STEP 1 — Guest Selection */}
            {!finalPassword && (
                <div className="flex flex-col items-center mt-32 px-4 text-black">
                    <h1 className="text-3xl font-bold mb-6 text-white">Select Guest</h1>

                    <div className="relative w-full max-w-md">
                        <input
                            type="text"
                            value={guestQuery}
                            placeholder="Search guest name…"
                            onFocus={() => setGuestOpen(true)}
                            onChange={(e) => {
                                setGuestQuery(e.target.value);
                                setGuestOpen(true);
                            }}
                            onBlur={() => setTimeout(() => setGuestOpen(false), 100)}
                            className="w-full bg-purple-900/40 border border-purple-700 rounded-xl
                   px-4 py-3 text-purple-100 placeholder-purple-400
                   focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />

                        {guestOpen && filteredGuests.length > 0 && (
                            <ul
                                className="absolute z-20 mt-2 w-full bg-purple-950
                       border border-purple-700 rounded-xl
                       max-h-60 overflow-y-auto scrollbar-purple"
                            >
                                {filteredGuests.map((guest) => (
                                    <li
                                        key={guest.password}
                                        onMouseDown={() => {
                                            setSelectedGuest(guest);
                                            setFinalPassword(guest.password);
                                            setGuestQuery(guest.name);
                                            setGuestOpen(false);
                                        }}
                                        className="px-4 py-3 cursor-pointer
                               hover:bg-purple-800/50
                               text-purple-200"
                                    >
                                        {guest.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {selectedGuest && (
                        <p className="text-purple-300 text-lg">
                            Welcome, <span className="font-semibold">{selectedGuest.name}</span>!
                        </p>
                    )}
                </div>
            )}

            {/* STEP 2 — Actions */}
            {finalPassword && mode === "normal" && (
                <main className="flex flex-col items-center mt-20 px-4">
                    <h1 className="text-3xl font-bold mb-8">Guest Share Tools</h1>

                    <div className="flex flex-col gap-4 w-full max-w-md">

                        <button
                            onClick={goFullscreen}
                            className="flex items-center gap-3 bg-purple-800/60 hover:bg-purple-700 transition px-5 py-3 rounded-xl text-lg"
                        >
                            <Maximize className="w-5 h-5"/>
                            Full Screen
                        </button>

                        <button
                            onClick={triggerPrint}
                            className="flex items-center gap-3 bg-purple-800/60 hover:bg-purple-700 transition px-5 py-3 rounded-xl text-lg"
                        >
                            <Printer className="w-5 h-5"/>
                            Print
                        </button>

                        <button
                            onClick={handleShare}
                            className="flex items-center gap-3 bg-purple-800/60 hover:bg-purple-700 transition px-5 py-3 rounded-xl text-lg"
                        >
                            <Share2 className="w-5 h-5"/>
                            Share Link
                        </button>
                    </div>
                </main>
            )}

            {/* STEP 3 — Full Screen Mode */}
            {finalPassword && mode === "fullscreen" && (
                <div className="absolute inset-0 overflow-auto p-8" style={{backgroundColor: '#462784'}}>
                    {renderShareView()}
                </div>
            )}

            {/* STEP 4 — Print Mode */}
            {finalPassword && mode === "print" && (
                <div className="absolute inset-0 p-8 print:p-0 print-bg" style={{backgroundColor: '#462784'}}>
                    {renderShareView()}
                </div>
            )}

            {/* Print CSS */}
            <style>{`
                @media print {
                    body {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    background: #1a0033 !important; /* fallback */
                }

                .print-bg {
                    background-color: inherit !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
            }
            `}</style>
        </div>
    );
}
