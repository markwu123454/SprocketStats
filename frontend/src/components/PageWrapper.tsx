// src/components/PageWrapper.tsx
import { Outlet } from "react-router-dom"

export default function PageWrapper({
    className = "",
    childrenBefore,
    childrenAfter,
}: {
    className?: string
    childrenBefore?: React.ReactNode
    childrenAfter?: React.ReactNode
}) {
    return (
        <div className={`min-h-screen w-full ${className}`}>
            {childrenBefore}
            <Outlet />
            {childrenAfter}
        </div>
    )
}