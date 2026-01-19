import {precacheAndRoute} from "workbox-precaching";
import {clientsClaim} from "workbox-core";

self.skipWaiting();
clientsClaim();

// REQUIRED — injected at build time
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
    ({request}) => request.mode === "navigate",
    new NetworkFirst({
        cacheName: "html-cache",
    })
);

self.addEventListener("push", event => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (err) {
        console.error("Invalid push payload", err);
        data = {};
    }

    const title = data.title || "Notification";
    const options = {
        body: data.body || "",
        icon: "/pwa/sprocket_logo_192.png",
        badge: "/pwa/sprocket_logo_128.png",
        tag: data.tag || "default",
        data: {
            url: data.url || "/",
        },
        requireInteraction: true, // important
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});


self.addEventListener("notificationclick", event => {
    event.notification.close();

    const url = event.notification.data?.url ?? "/";

    event.waitUntil(
        self.clients.matchAll({type: "window", includeUncontrolled: true})
            .then(clients => {
                for (const client of clients) {
                    if (client.url === url && "focus" in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(url);
                }
            })
    );
});
