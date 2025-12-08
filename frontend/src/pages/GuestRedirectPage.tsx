import {useEffect} from "react"
import {useNavigate, useSearchParams} from "react-router-dom"

export default function GuestRedirect() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    useEffect(() => {
        const token = searchParams.get("pw")

        if (!token) {
            navigate("/admin/data/guest?error=missing", {replace: true})
            return
        }

        // Store token and expiry for 1 hour
        const expiry = Date.now() + 60 * 60 * 1000
        localStorage.setItem("guest_pw_token", token)
        localStorage.setItem("guest_pw_expiry", expiry.toString())

        // Redirect and remove query param
        navigate("/admin/data/guest", {replace: true})
    }, [searchParams, navigate])

    return (
        <div className="min-h-screen flex items-center justify-center bg-purple-950 text-purple-100">
            <p>Redirecting to guest portal...</p>
        </div>
    )
}
