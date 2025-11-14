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

    // --- Theme variables ---
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
        3473: {
            "--themed-h1-color": "#ffffff",
            "--themed-subtext-color": "#d4d4d8",
            "--themed-border-color": "#6d28d9",
            "--themed-bg": "rgba(76,29,149,0.75)",
            "--themed-button-bg": "#7c3aed",
            "--themed-button-hover": "#8b5cf6",
            "--themed-text-color": "#ffffff",
        },
    };

    const bgClass =
        theme === "dark"
            ? "bg-zinc-950/70 border-zinc-800"
            : theme === "light"
                ? "bg-white border-zinc-300"
                : theme === "2025"
                    ? "bg-[#0b234f]/70 border-[#1b3d80]"
                    : theme === "2026"
                        ? "bg-[#fef7dc]/80 border-[#e6ddae]"
                        : "bg-[#4c1d95]/75 border-[#6d28d9]";

    const textClass =
        theme === "dark"
            ? "text-white"
            : theme === "light"
                ? "text-zinc-900"
                : theme === "2025"
                    ? "text-white"
                    : theme === "2026"
                        ? "text-[#3b2d00]"
                        : "text-white";

    return (
        <div
            className={`relative min-h-screen w-full transition-colors duration-700 ease-in-out px-6 ${
                overflow
                    ? "flex flex-col items-center overflow-y-auto"
                    : "flex items-center justify-center"
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
                {/* Base color layers */}
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
                {theme === "3473" && (
                    <div
                        className="absolute inset-0 transition-opacity duration-700 ease-in-out opacity-100"
                        style={{
                            background: `
                radial-gradient(80% 110% at 10% 10%, #4c2c7a, #1f0b46),
                linear-gradient(135deg, #140a2a, #1f0b46)
            `,
                            backgroundAttachment: "fixed",
                        }}
                    />
                )}
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
                className={`relative z-10 w-full max-w-md mx-4 my-12 p-6 rounded-lg shadow-lg space-y-6 border backdrop-blur-sm ${bgClass} ${textClass}`}
            >
                {children}
            </div>
        </div>
    );
}
