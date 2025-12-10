import {useMemo, useState, useRef, useLayoutEffect} from "react"

interface NotFoundPageProps {
    code?: 403 | 404 | 501 | 503
}

export default function NotFoundPage({code = 404}: NotFoundPageProps) {
    // Meme URLs
    const memeImages = useMemo(() => [
        "/meme/1.gif",
        "/meme/1.png",
        "/meme/2.gif",
        "/meme/2.gif",
        "/meme/3.png",
        "/meme/5.png",
        "/meme/6.png",
        "/meme/7.png",
        "/meme/8.png",
        "/meme/9.png",
        "/meme/img.png",
        "/meme/img_1.png",
        "/meme/img_2.png",
        "/meme/img_3.png",
        "/meme/img_4.png",
        "/meme/img_5.png",
        "/meme/img_6.png",
        "/meme/img_7.png",
        "/meme/img_8.png",
        "/meme/img_9.png",
        "/meme/img_10.png",
        "/meme/Spot_the_cow.gif",
        "/meme/frc-crescendo (1).gif",
    ], [])
    // Code below is used to randomly select an image out of a collection of memes
    const [recentImages, setRecentImages] = useState<string[]>([])

    const getRandomImage = () => {
        const available = memeImages.filter(img => !recentImages.includes(img))
        const pool = available.length > 0 ? available : memeImages
        return pool[Math.floor(Math.random() * pool.length)]
    }

    const [currentImage, setCurrentImage] = useState(() => {
        // safe: recentImages now initialized
        const pool = memeImages
        return pool[Math.floor(Math.random() * pool.length)]
    })

    const paragraphRef = useRef<HTMLParagraphElement>(null)
    const [paraWidth, setParaWidth] = useState<number>()

    useLayoutEffect(() => {
        if (paragraphRef.current) setParaWidth(paragraphRef.current.offsetWidth)
    }, [])

    //title that pops up based on your situation or how you were trying to find a page
    const title =
        code === 501 ? "Not implemented"
        : code === 403 ? "Access denied"
        : code === 503 ? "No Internet"
        : "Page not found"

    //Code below is used to create a message to explain why they couldn’t access the page based on the type of error
    const message =
        code === 501 ? (
            <>This page or feature hasn’t been implemented yet.<br/>Please contact a captain or lead if you believe this is an error.</>
        ) : code === 403 ? (
            <>You don’t have permission to access this page.<br/>Nice try.</>
        ) : code === 503 ? (
            <>This page requires internet to access.<br/>Try mobile data.</>
        ) : (
            <>Sorry, we couldn’t find the page you’re looking for.<br/>Womp, womp.</>
        )


    return (
        <div
            className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-top bg-cover transition-colors duration-500 theme-bg-page"
        >
            <div
                className="w-full md:w-1/2 flex flex-col justify-center items-start px-8 md:pl-20 py-10 gap-y-4 transition-colors duration-300 theme-text"
            >
                <div
                    className="text-md sm:text-lg font-semibold theme-text-contrast"
                >
                    {code}
                </div>

                <h1
                    className="text-5xl sm:text-6xl font-bold theme-text"
                >
                    {title}
                </h1>

                <p
                    ref={paragraphRef}
                    className="text-lg sm:text-xl theme-text"
                >
                    {message}
                </p>
                {/* stacks items and spaces them evenly */}
                <div
                    className="flex flex-col md:flex-row justify-between items-start md:items-center gap-y-2 mt-2"
                    style={paraWidth ? {width: paraWidth} : {}}
                >
                    <a
                        href="/"
                        className="text-base sm:text-lg font-medium transition-colors duration-200 hover:underline theme-text-contrast"
                    >
                        ← Back to home
                    </a>
                    {/*  */}
                    <button  //button that randomizes what meme youll get
                        onClick={() => {
                            const next = getRandomImage()
                            setCurrentImage(next)

                            setRecentImages(prev => {
                                const updated = [...prev, next]
                                // Keep only the last 10 images
                                return updated.slice(-10)
                            })
                        }}  //shows what color the “See another meme” text is going to be and underlines it
                        className="text-base sm:text-lg font-medium transition-colors duration-200 hover:underline theme-text-contrast"
                    >
                        See another meme →
                    </button>

                </div>
            </div>

            <div className="w-full md:w-1/2 flex items-center justify-center h-full">
                <img
                    src={currentImage}
                    alt="Random meme"
                    className="max-h-full w-auto object-contain transition-all duration-300"
                />
            </div>
        </div>
    )
}
