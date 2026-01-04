import {useEffect, useState} from "react"
import {useNavigate, useSearchParams} from "react-router-dom"
import {KeyRound, Eye, EyeOff} from "lucide-react"

import {useAuthSuccess, useLoading, useDataContext} from "@/components/wrappers/DataWrapper"


export default function GuestLoginPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { refresh } = useDataContext()

    const authSuccess = useAuthSuccess()
    const loading = useLoading()

    const [manualPw, setManualPw] = useState("")
    const [showManualPortal, setShowManualPortal] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")
    const [attempted, setAttempted] = useState(false)

    // Initial check for ?pw
    useEffect(() => {
        const token = searchParams.get("pw")

        if (!token) {
            setShowManualPortal(true)
            return
        }

        saveToken(token)
    }, [searchParams])

    /** Save token + expiry, then redirect */
    function saveToken(token: string) {
        const expiry = Date.now() + 60 * 60 * 1000
        localStorage.setItem("guest_pw_token", token)
        localStorage.setItem("guest_pw_expiry", expiry.toString())
    }

    useEffect(() => {
        if (authSuccess) {
            navigate("/data/guest", {replace: true})
        }
    }, [authSuccess, navigate])

    useEffect(() => {
        if (!loading && attempted && !authSuccess) {
            setError("Invalid guest password.")
            setShowManualPortal(true)
        }
    }, [loading, authSuccess, attempted])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setAttempted(true)

        if (!manualPw.trim()) {
            setError("Please enter a valid password.")
            return
        }

        saveToken(manualPw.trim())
        await refresh()
    }

    // Polished password portal
    if (showManualPortal) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center
                            bg-linear-to-b from-purple-950 via-purple-900 to-purple-950
                            text-purple-100 px-4">

                {/* Hero */}
                <div className="flex flex-col items-center mb-10 animate-fadeIn">
                    <div className="relative w-20 h-20 mb-5">
                        <img
                            src="/static/sprocket_logo_ring.png"
                            alt="Sprocket Logo Ring"
                            className="absolute inset-0 w-full h-full animate-spin-slow"
                        />
                        <img
                            src="/static/sprocket_logo_gear.png"
                            alt="Sprocket Logo Gear"
                            className="absolute inset-0 w-full h-full"
                        />
                    </div>

                    <h1 className="text-3xl font-bold tracking-tight">Guest Access Portal</h1>
                    <p className="text-purple-300 text-center max-w-sm mt-2 text-sm">
                        Enter your guest password to access shared scouting data and match insights.
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-purple-900/40 backdrop-blur-sm p-8 rounded-2xl
                                border border-purple-800 shadow-xl w-full max-w-sm
                                animate-fadeInDelay">

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <label className="text-sm flex items-center gap-2 text-purple-300">
                            <KeyRound className="w-4 h-4 text-purple-400"/>
                            Guest Password
                        </label>

                        {/* PASSWORD FIELD WITH TOGGLE */}
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={manualPw}
                                onChange={(e) => setManualPw(e.target.value)}
                                className="px-4 py-2 w-full rounded-lg bg-purple-950 border border-purple-700
                                           focus:outline-none focus:border-purple-400 transition pr-12"
                                placeholder="Enter password"
                            />

                            {/* Eye icon button */}
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute inset-y-0 right-3 flex items-center text-purple-400
                                           hover:text-purple-200 transition"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? (
                                    <EyeOff className="w-5 h-5"/>
                                ) : (
                                    <Eye className="w-5 h-5"/>
                                )}
                            </button>
                        </div>

                        {error && (
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        )}

                        <button
                            type="submit"
                            className="bg-purple-700 hover:bg-purple-600 transition
                                       text-white py-2 rounded-lg font-semibold
                                       shadow-md hover:shadow-purple-700/40"
                        >
                            Continue
                        </button>
                    </form>
                </div>

                <style>
                    {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes fadeInDelay {
                        from { opacity: 0; transform: translateY(15px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .animate-fadeIn { animation: fadeIn 0.8s ease-out forwards; }
                    .animate-fadeInDelay { animation: fadeInDelay 1s ease-out forwards; }
                    @keyframes spin-slow {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .animate-spin-slow { animation: spin-slow 10s linear infinite; }
                    `}
                </style>
            </div>
        )
    }

    // Normal redirect screen
    return (
        <div className="min-h-screen flex items-center justify-center bg-purple-950 text-purple-100">
            <p>Redirecting to guest portal...</p>
        </div>
    )
}
