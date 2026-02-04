import React from "react";
import {Link} from "react-router-dom";
import {ArrowLeft} from "lucide-react";

type DevLayoutProps = {
    header?: React.ReactNode | {
        back_link: string
        title: string
        subtitle: string
        right_heading: string
    }
    body: React.ReactNode
    footer?: React.ReactNode | {
        left_footer: string
        right_footer: string
    }
}

export function HeaderFooterLayoutWrapper({
                                              header,
                                              body,
                                              footer,
                                          }: DevLayoutProps) {
    // Type guards to check if props are objects with specific properties
    const isHeaderObject = (h: any): h is { title: string; subtitle: string; right_heading: string } => {
        return h && typeof h === 'object' && 'title' in h && 'subtitle' in h && 'right_heading' in h;
    };

    const isFooterObject = (f: any): f is { left_footer: string; right_footer: string } => {
        return f && typeof f === 'object' && 'left_footer' in f && 'right_footer' in f;
    };

    return (
        <div className="min-h-screen relative text-sm max-w-full overflow-hidden theme-text">

            {/* BACKGROUND LAYER */}
            <div className="absolute inset-0 bg-top bg-cover theme-bg-page"/>

            <div className="h-screen flex flex-col min-h-0 relative max-w-full overflow-hidden">

                {/* HEADER */}
                {header && (
                    <header className="h-16 px-6 flex items-center border-b backdrop-blur-md theme-bg theme-border">
                        {isHeaderObject(header) ? (
                            <>
                                <div className="flex items-center gap-4 text-xl theme-text">
                                    <Link
                                        to={header.back_link}
                                        className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover transition-colors"
                                    >
                                        <ArrowLeft className="h-5 w-5"/>
                                    </Link>
                                    <span className="text-base font-semibold">Back</span>
                                </div>
                                <div className="flex-1 text-center min-w-0">
                                    <p className="text-lg font-bold">{header.title}</p>
                                    <p className="text-xs opacity-70 truncate">
                                        {header.subtitle}
                                    </p>
                                </div>

                                <div className="text-xs opacity-70 text-right whitespace-nowrap shrink-0">
                                    {header.right_heading}
                                </div>
                            </>
                        ) : (
                            <div>
                                {header}
                            </div>
                        )}
                    </header>
                )}

                {/* BODY */}
                <main className="flex-1 p-6 gap-6 max-w-full overflow-auto theme-scrollbar">
                    {body}
                </main>

                {/* FOOTER */}
                {footer && (
                    <footer
                        className="h-16 border-t px-6 flex items-center justify-between backdrop-blur-md text-xs font-semibold tracking-wide theme-bg theme-border">
                        {isFooterObject(footer) ? (
                            <>
                                <div className="opacity-70 text-left">
                                    {footer.left_footer}
                                </div>

                                <div className="opacity-70 text-right">
                                    {footer.right_footer}
                                </div>
                            </>
                        ) : (
                            <div>
                                {footer}
                            </div>
                        )}
                    </footer>
                )}

            </div>
        </div>
    )
}