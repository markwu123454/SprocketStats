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

    let guestUrl = "https://sprocketstats.io/guest";
    guestUrl = "https://sprocketstats.vercel.app/guest";
    const fullLink = finalPassword ? `${guestUrl}?pw=${finalPassword}` : guestUrl;

    const filteredGuests = guests.filter(g =>
        g.name.toLowerCase().includes(guestQuery.toLowerCase())
    );

    useEffect(() => {
        getAllGuest().then(setGuests).catch(console.error)
    }, [])

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

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Sprocket Guest Access",
                    text: `Guest portal link:\n${fullLink}`,
                    url: fullLink
                });
                return;
            } catch {
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
            root.requestFullscreen();
        } else if ((root as any).webkitRequestFullscreen) {
            (root as any).webkitRequestFullscreen();
        }

        setMode("fullscreen");
    };


    const renderShareView = () => (
        <div className="w-full h-full flex flex-col justify-center items-center py-8 px-6 text-center">

            {/* Header */}
            <h2 className="text-4xl md:text-5xl font-bold mb-10">Guest Access</h2>

            {/* Intro Message */}
            <div className="max-w-3xl mb-12 text-purple-200 text-lg leading-relaxed">
                <p className="mb-4 font-semibold text-xl text-purple-300">
                    Welcome{selectedGuest ? `, ${selectedGuest.name}` : ""}!
                </p>
                <p>
                    Team Sprocket has decided to share some of our scouting data with you
                    for upcoming matches. You can access the shared workspace either by
                    scanning the QR code or by visiting the link and entering the password.
                </p>
            </div>

            {/* Side-by-side layout */}
            <div className="flex flex-col md:flex-row gap-10 items-center justify-center w-full">

                {/* QR Code Box */}
                <div
                    className="bg-white p-6 rounded-2xl shadow-xl flex justify-center items-center"
                    style={{width: "min(260px, 60vw)", height: "260px"}}
                >
                    <div ref={qrRef}></div>
                </div>

                {/* URL + Password Panel */}
                <div className="w-full max-w-md text-left">

                    {/* URL */}
                    <div className="mb-6">
                        <p className="text-purple-300 mb-2 text-xl">Guest Login Page</p>
                        <div
                            className="bg-purple-950/40 p-4 border border-purple-700 rounded-xl text-lg flex items-center gap-3">
                            <span className="truncate">{guestUrl}</span>
                        </div>
                    </div>

                    {/* Password */}
                    <div className="mb-6">
                        <p className="text-purple-300 mb-2 text-xl">Password</p>
                        <div
                            className="bg-purple-950/40 p-4 border border-purple-700 rounded-xl text-lg flex items-center gap-3">
                            <span className="truncate">{finalPassword}</span>
                        </div>
                    </div>

                    {/* Small instructions */}
                    <p className="text-purple-200 text-sm leading-relaxed">
                        Navigate to the link above and enter the password to access the shared scouting data.
                    </p>
                </div>
            </div>
        </div>
    );


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
                <div className="absolute inset-0 bg-purple-950 overflow-auto p-8">
                    {renderShareView()}
                </div>
            )}

            {/* STEP 4 — Print Mode */}
            {finalPassword && mode === "print" && (
                <div className="absolute inset-0 bg-purple-950 p-8 print:p-0 print-bg">
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
