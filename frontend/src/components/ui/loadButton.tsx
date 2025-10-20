import React, {type JSX} from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react"

interface LoadButtonProps {
    status: "idle" | "loading" | "success" | "error" | "warning"
    onClick: () => void
    disabled?: boolean
    className?: string
    children: React.ReactNode
    message?: string
}

export default function LoadButton({
    status,
    onClick,
    disabled,
    className = "",
    children,
    message,
}: LoadButtonProps) {
    const isLoading = status === "loading"
    const isFeedbackState = status !== "idle"

    const iconMap: Record<Exclude<typeof status, "idle">, JSX.Element> = {
        loading: <Loader2 className="h-4 w-4 animate-spin" />,
        success: <CheckCircle className="h-4 w-4 text-green-500" />,
        error: <XCircle className="h-4 w-4 text-red-500" />,
        warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    }

    const defaultMessages: Record<Exclude<typeof status, "idle">, string> = {
        loading: "Submitting...",
        success: "Success",
        error: "Error",
        warning: "Warning",
    }

    return (
        <Button
            onClick={onClick}
            disabled={disabled || isLoading}
            className={className}
        >
            {isFeedbackState ? (
                <div className="flex items-center gap-2">
                    {iconMap[status as Exclude<typeof status, "idle">]}
                    {message || defaultMessages[status as Exclude<typeof status, "idle">]}
                </div>
            ) : (
                children
            )}
        </Button>
    )
}
