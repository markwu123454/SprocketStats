import {useEffect, useRef} from "react"

export function QRCodeScanner({
                                  onResult,
                                  onError,
                              }: {
    onResult: (text: string) => void
    onError?: (err: unknown) => void
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const detectorRef = useRef<BarcodeDetector | null>(null)
    const rafRef = useRef<number | null>(null)
    const streamRef = useRef<MediaStream | null>(null)

    useEffect(() => {
        let cancelled = false

        async function start() {
            try {
                streamRef.current = await navigator.mediaDevices.getUserMedia({
                    video: {facingMode: "environment"},
                })

                const video = videoRef.current!
                video.srcObject = streamRef.current
                await video.play()

                detectorRef.current = new BarcodeDetector({
                    formats: ["qr_code"],
                })

                const scan = async () => {
                    if (cancelled || !videoRef.current) return

                    try {
                        const codes = await detectorRef.current!.detect(video)
                        if (codes.length > 0) {
                            onResult(codes[0].rawValue)
                            return
                        }
                    } catch (err) {
                        onError?.(err)
                    }

                    rafRef.current = requestAnimationFrame(scan)
                }

                scan()
            } catch (err) {
                onError?.(err)
            }
        }

        start()

        return () => {
            cancelled = true
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            streamRef.current?.getTracks().forEach(t => t.stop())
        }
    }, [onResult, onError])

    return (
        <video
            ref={videoRef}
            className="w-full rounded-md bg-black"
            playsInline
            muted
        />
    )
}
