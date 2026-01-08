import React, {useState} from "react";
import {getSettingSync, type Settings} from "@/db/settingsDb";

interface ThemedWrapperProps {
    showLogo?: boolean;
    children: React.ReactNode;
}

export default function CardLayoutWrapper({
                                              showLogo = true,
                                              children
                                          }: ThemedWrapperProps) {

    const [theme] = useState<Settings["theme"]>(
        () => getSettingSync("theme") ?? "2026"
    );

    return (
        <div className="relative h-screen min-h-0 w-full overflow-hidden">
            <div className="fixed inset-0 bg-top bg-cover theme-bg-page"/>

            <div className="relative z-10 h-full px-6 py-6 flex flex-col overflow-y-auto theme-scrollbar">

                {showLogo && (theme === "2025" || theme === "2026") && (
                    <img
                        src={`/seasons/${theme}/logo_animation.gif`}
                        alt="logo animation"
                        loading="lazy"
                        decoding="async"
                        className="fixed top-2 left-4 h-20 pointer-events-none"
                    />
                )}

                {showLogo && theme === "3473" && (
                    <div className="fixed top-2 left-4 h-20 w-20 pointer-events-none">
                        <img
                            src="/static/sprocket_logo_gear.png"
                            className="absolute inset-0 w-full h-full animate-[spin_18s_linear_infinite] direction-[reverse]"
                            loading="lazy"
                            decoding="async"
                            alt="logo animation"
                        />
                        <img
                            src="/static/sprocket_logo_ring.png"
                            className="absolute inset-0 w-full h-full animate-[spin_12s_linear_infinite]"
                            loading="lazy"
                            decoding="async"
                            alt="logo animation"
                        />
                    </div>
                )}

                <div
                    className="w-full max-w-md mx-auto my-auto p-6 rounded-lg shadow-lg space-y-4 backdrop-blur-sm theme-bg theme-text theme-border">
                    {children}
                </div>
            </div>
        </div>
    );
}
