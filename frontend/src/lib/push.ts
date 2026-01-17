export async function registerServiceWorker() {
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("SW scope:", registration.scope);

    return registration
}

export async function subscribeToPush(
    registration: ServiceWorkerRegistration,
    vapidKey: string
) {
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
