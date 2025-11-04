import { useMemo, useState, useRef, useLayoutEffect } from "react"

interface NotFoundPageProps {
    code?: 403 | 404 | 501 | 503
}

export default function NotFoundPage({ code = 404 }: NotFoundPageProps) {
    const memeImages = useMemo(() => {
        const allImports = import.meta.glob("/meme/*.{png,gif}", { eager: true })
        return Object.values(allImports).map((mod: any) => mod.default)
    }, [])

    const getRandomImage = () => memeImages[Math.floor(Math.random() * memeImages.length)]
    const [currentImage, setCurrentImage] = useState(getRandomImage)

    const paragraphRef = useRef<HTMLParagraphElement>(null)
    const [paraWidth, setParaWidth] = useState<number | undefined>(undefined)

    useLayoutEffect(() => {
        if (paragraphRef.current) setParaWidth(paragraphRef.current.offsetWidth)
    }, [])

    const title =
        code === 501
            ? "Not implemented"
            : code === 403
            ? "Access denied"
            : code === 503
            ? "No Internet"
            : "Page not found"

    const message =
        code === 501 ? (
            <>
                This page or feature hasn’t been implemented yet.<br />
                Please contact a captain or lead if you believe this is an error.
            </>
        ) : code === 403 ? (
            <>
                You don’t have permission to access this page.<br />
                Nice try.
            </>
        ) : code === 503 ? (
            <>
                This page requires internet to access.<br />
                Try mobile data.
            </>
        ) : (
            <>
                Sorry, we couldn’t find the page you’re looking for.<br />
                Womp, womp.
            </>
        )

    return (
        <div
            className="
                flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-top bg-cover transition-colors duration-500
                theme-light:bg-zinc-100
                theme-dark:bg-zinc-950
                theme-2025:bg-[url('seasons/2025/expanded.png')]
                theme-2026:bg-[url('seasons/2025/expanded.png')]
            "
        >
            {/* --- Text Section --- */}
            <div
                className="
                    w-full md:w-1/2 flex flex-col justify-center items-start px-8 md:pl-20 py-10 gap-y-4
                    transition-colors duration-300
                    theme-light:text-zinc-900
                    theme-dark:text-white
                    theme-2025:text-white
                    theme-2026:text-[#3b2d00]
                "
            >
                <div
                    className="
                        text-md sm:text-lg font-semibold
                        theme-light:text-orange-600
                        theme-dark:text-amber-400
                        theme-2025:text-blue-300
                        theme-2026:text-[#a28d46]
                    "
                >
                    {code}
                </div>

                <h1
                    className="
                        text-5xl sm:text-6xl font-bold
                        theme-light:text-zinc-900
                        theme-dark:text-white
                        theme-2025:text-white
                        theme-2026:text-[#3b2d00]
                    "
                >
                    {title}
                </h1>

                <p
                    ref={paragraphRef}
                    className="
                        text-lg sm:text-xl
                        theme-light:text-zinc-700
                        theme-dark:text-zinc-300
                        theme-2025:text-zinc-100
                        theme-2026:text-[#5a4800]
                    "
                >
                    {message}
                </p>

                <div
                    className="flex flex-col md:flex-row justify-between items-start md:items-center gap-y-2 mt-2"
                    style={paraWidth ? { width: paraWidth } : {}}
                >
                    <a
                        href="/"
                        className="
                            text-base sm:text-lg font-medium transition-colors duration-200
                            theme-light:text-orange-700 theme-light:hover:underline
                            theme-dark:text-amber-400 theme-dark:hover:underline
                            theme-2025:text-blue-300 theme-2025:hover:text-blue-200
                            theme-2026:text-[#7a651e] theme-2026:hover:underline
                        "
                    >
                        ← Back to home
                    </a>

                    <button
                        onClick={() => setCurrentImage(getRandomImage())}
                        className="
                            text-base sm:text-lg font-medium transition-colors duration-200
                            theme-light:text-orange-700 theme-light:hover:underline
                            theme-dark:text-amber-400 theme-dark:hover:underline
                            theme-2025:text-blue-300 theme-2025:hover:text-blue-200
                            theme-2026:text-[#7a651e] theme-2026:hover:underline
                        "
                    >
                        See another meme →
                    </button>
                </div>
            </div>

            {/* --- Image Section --- */}
            <div className="w-full md:w-1/2 flex-1 flex items-center justify-center h-full">
                <img
                    src={currentImage}
                    alt="Random meme"
                    className="
                        max-h-full w-auto object-contain transition-all duration-300
                        theme-light:brightness-100
                        theme-dark:brightness-95
                        theme-2025:brightness-110
                        theme-2026:brightness-100
                    "
                />
            </div>
        </div>
    )
}
