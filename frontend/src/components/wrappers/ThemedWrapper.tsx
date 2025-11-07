import React, {useEffect, useRef, useState} from "react";

interface ThemedWrapperProps {
    theme: "dark" | "light" | "2025" | "2026";
    showLogo?: boolean;
    children: React.ReactNode;
}

export default function ThemedWrapper({theme, showLogo = true, children}: ThemedWrapperProps) {
    const parallaxRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1.1);
    const [centerMode, setCenterMode] = useState(true);

    // --- Measure card height + decide centering + scaling ---
    useEffect(() => {
        const updateMetrics = () => {
            const card = contentRef.current;
            if (!card) return;
            const contentHeight = card.scrollHeight + 300;
            const viewportHeight = window.innerHeight;

            const s = 1 + Math.min((contentHeight - viewportHeight) / viewportHeight * 0.4, 0.8);
            setScale(Math.max(1.1, s));
            setCenterMode(contentHeight <= viewportHeight * 0.9); // center if fits nicely
        };

        updateMetrics();
        window.addEventListener("resize", updateMetrics);
        return () => window.removeEventListener("resize", updateMetrics);
    }, []);

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

    // --- Theme variables for content styling ---
    const themeVars: Record<string, React.CSSProperties> = {
        dark: {
            "--themed-h1-color": "#ffffff",
            "--themed-subtext-color": "#a1a1aa",
            "--themed-border-color": "#27272a",
            "--themed-bg": "rgba(9,9,11,0.7)",
            "--themed-button-bg": "#3f3f46",
            "--themed-button-hover": "#52525b",
            "--themed-text-color": "#ffffff",
        },
        light: {
            "--themed-h1-color": "#18181b",
            "--themed-subtext-color": "#52525b",
            "--themed-border-color": "#d4d4d8",
            "--themed-bg": "#ffffff",
            "--themed-button-bg": "#f4f4f5",
            "--themed-button-hover": "#e4e4e7",
            "--themed-text-color": "#18181b",
        },
        2025: {
            "--themed-h1-color": "#ffffff",
            "--themed-subtext-color": "#d4d4d8",
            "--themed-border-color": "#1b3d80",
            "--themed-bg": "rgba(11,35,79,0.7)",
            "--themed-button-bg": "rgba(16,43,106,0.8)",
            "--themed-button-hover": "#1d3d7d",
            "--themed-text-color": "#ffffff",
        },
        2026: {
            "--themed-h1-color": "#3b2d00",
            "--themed-subtext-color": "#5a4800",
            "--themed-border-color": "#e6ddae",
            "--themed-bg": "rgba(254,247,220,0.8)",
            "--themed-button-bg": "#fff8e5",
            "--themed-button-hover": "#f7edcc",
            "--themed-text-color": "#3b2d00",
        },
    };

    const bgClass =
        theme === "dark"
            ? "bg-zinc-950/70 border-zinc-800"
            : theme === "light"
                ? "bg-white border-zinc-300"
                : theme === "2025"
                    ? "bg-[#0b234f]/70 border-[#1b3d80]"
                    : "bg-[#fef7dc]/80 border-[#e6ddae]";

    const textClass =
        theme === "dark"
            ? "text-white"
            : theme === "light"
                ? "text-zinc-900"
                : theme === "2025"
                    ? "text-white"
                    : "text-[#3b2d00]";

    return (
        <div
            className={`relative min-h-screen w-full transition-colors duration-700 ease-in-out px-6 ${
                centerMode
                    ? "flex items-center justify-center"
                    : "flex flex-col items-center overflow-y-auto"
            }`}
            style={{
                ...themeVars[theme],
                overflowX: "hidden",
            }}
        >

            {/* Parallax Background */}
            <div
                ref={parallaxRef}
                className="fixed inset-0 z-0 will-change-transform"
                style={{transformOrigin: "center top"}}
            >
                <div
                    className={`absolute inset-0 ${
                        theme === "light" ? "bg-zinc-100" : theme === "dark" ? "bg-zinc-950" : ""
                    }`}
                />
                <div
                    className={`absolute inset-0 bg-top bg-cover transition-opacity duration-700 ease-in-out ${
                        theme === "2025" ? "opacity-100" : "opacity-0"
                    } bg-[url('/seasons/2025/expanded.png')]`}
                />
                <div
                    className={`absolute inset-0 bg-top bg-cover transition-opacity duration-700 ease-in-out ${
                        theme === "2026" ? "opacity-100" : "opacity-0"
                    } bg-[url('/seasons/2026/expanded.png')]`}
                />
            </div>

            {/* Logo */}
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

            {/* Foreground card */}
            <div
                ref={contentRef}
                className={`relative z-10 w-full max-w-md mx-4 my-12 p-6 rounded-lg shadow-lg space-y-6 border backdrop-blur-sm ${bgClass} ${textClass}`}
            >
                {children}
            </div>
        </div>
    );
}
