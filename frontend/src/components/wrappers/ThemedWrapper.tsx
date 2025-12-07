import React, {useEffect, useRef, useState} from "react";

interface ThemedWrapperProps {
    theme: "dark" | "light" | "2025" | "2026" | "3473";
    showLogo?: boolean;
    overflow?: boolean;
    children: React.ReactNode;
}

export default function ThemedWrapper({theme, showLogo = true, overflow = false, children}: ThemedWrapperProps) {
    const parallaxRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1.1);

    // --- Scale based on content or overflow ---
    useEffect(() => {
        const updateScale = () => {
            const vh = window.innerHeight;
            const baseScale = 1.1;
            const scaleFactor = overflow ? Math.min(1.1 + vh / 1500, 1.8) : baseScale;
            setScale(scaleFactor);
        };
        updateScale();
        window.addEventListener("resize", updateScale);
        return () => window.removeEventListener("resize", updateScale);
    }, [overflow]);

    // --- Parallax translation ---
    useEffect(() => {
        const bg = parallaxRef.current;
        if (!bg) return;
        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                const y = window.scrollY;
                bg.style.transform = `translateY(${-y * 0.3}px) scale(${scale})`;
                raf = 0;
            });
        };
        onScroll();
        window.addEventListener("scroll", onScroll, {passive: true});
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [scale]);

    return (
        <div
            className={`relative min-h-screen w-full transition-colors duration-700 ease-in-out px-6 ${
                overflow
                    ? "flex flex-col items-center overflow-y-auto"
                    : "flex items-center justify-center"
            }`}
            style={{overflowX: "hidden",}}
        >
            {/* Parallax Background */}
            <div
                ref={parallaxRef}
                className="fixed inset-0 z-0 will-change-transform"
                style={{transformOrigin: "center top"}}
            >
                {/* Light theme layer */}
                <div
                    className={`absolute inset-0 bg-zinc-100 transition-opacity duration-700 ${
                        theme === "light" ? "opacity-100" : "opacity-0"
                    }`}
                />

                {/* Dark theme layer */}
                <div
                    className={`absolute inset-0 bg-zinc-950 transition-opacity duration-700 ${
                        theme === "dark" ? "opacity-100" : "opacity-0"
                    }`}
                />

                {/* 2025 image */}
                <div
                    className={`absolute inset-0 bg-top bg-cover bg-[url('/seasons/2025/expanded.png')] transition-opacity duration-700 ${
                        theme === "2025" ? "opacity-100" : "opacity-0"
                    }`}
                />

                {/* 2026 image */}
                <div
                    className={`absolute inset-0 bg-top bg-cover bg-[url('/seasons/2026/expanded.png')] transition-opacity duration-700 ${
                        theme === "2026" ? "opacity-100" : "opacity-0"
                    }`}
                />

                {/* 3473 radial gradient */}
                <div
                    className={`absolute inset-0 transition-opacity duration-700 ${
                        theme === "3473" ? "opacity-100" : "opacity-0"
                    }`}
                    style={{
                        background: `radial-gradient(80% 110% at 10% 10%, #4c2c7a, #1f0b46), linear-gradient(135deg, #140a2a, #1f0b46)`,
                    }}
                />
            </div>

            {/* Animated logos (if enabled) */}
            {showLogo && (theme === "2025" || theme === "2026") && (
                <img
                    src={
                        theme === "2025"
                            ? "/seasons/2025/logo_animation.gif"
                            : "/seasons/2026/logo_animation.gif"
                    }
                    alt="logo animation"
                    className="fixed top-2 left-4 h-20 pointer-events-none z-10"
                />
            )}

            {/* 3473 dual-rotating sprocket logo */}
            {showLogo && theme === "3473" && (
                <div className="fixed top-2 left-4 h-20 w-20 pointer-events-none z-10">
                    <img
                        src="/static/sprocket_logo_gear.png"
                        alt="Sprocket gear"
                        className="absolute inset-0 w-full h-full animate-[spin_18s_linear_infinite] [animation-direction:reverse]"
                    />
                    <img
                        src="/static/sprocket_logo_ring.png"
                        alt="Sprocket ring"
                        className="absolute inset-0 w-full h-full animate-[spin_12s_linear_infinite]"
                    />
                </div>
            )}

            {/* Foreground Card */}
            <div
                className={`relative z-10 w-full max-w-md mx-4 my-12 p-6 rounded-lg shadow-lg space-y-6 border backdrop-blur-sm theme-bg theme-text theme-border`}
            >
                {children}
            </div>
        </div>
    );
}
