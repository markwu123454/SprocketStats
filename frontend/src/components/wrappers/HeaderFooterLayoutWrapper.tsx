import React from "react";

type DevLayoutProps = {
    header?: React.ReactNode
    body: React.ReactNode
    footer?: React.ReactNode
}

export function HeaderFooterLayoutWrapper({
    header,
    body,
    footer,
}: DevLayoutProps) {
    return (
        <div className="min-h-screen relative text-sm max-w-full overflow-hidden theme-text">

            {/* BACKGROUND LAYER */}
            <div className="absolute inset-0 bg-top bg-cover theme-bg-page" />

            <div className="h-screen flex flex-col min-h-0 relative max-w-full overflow-hidden">

                {/* HEADER */}
                {header && (
                    <header className="h-16 px-6 flex items-center border-b backdrop-blur-md theme-bg theme-border">
                        {header}
                    </header>
                )}

                {/* BODY */}
                <main className="flex-1 p-6 gap-6 max-w-full overflow-auto theme-scrollbar">
                    {body}
                </main>

                {/* FOOTER */}
                {footer && (
                    <footer className="h-16 border-t px-6 flex items-center justify-between backdrop-blur-md text-xs font-semibold tracking-wide theme-bg theme-border">
                        {footer}
                    </footer>
                )}

            </div>
        </div>
    )
}
