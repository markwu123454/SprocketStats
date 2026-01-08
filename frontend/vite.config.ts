import path from "path";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {VitePWA} from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),

        VitePWA({
            registerType: "autoUpdate",

            includeAssets: [
                "favicon.ico",
                "robots.txt",
                "apple-touch-icon.png",
            ],

            manifest: {
                name: "Sprocketstats",
                short_name: "Spstats",
                start_url: "/",
                display: "standalone",
                background_color: "#000000",
                theme_color: "#000000",
                icons: [
                    {src: "/pwa/sprocket_logo_128.png", sizes: "128x128", type: "image/png"},
                    {src: "/pwa/sprocket_logo_192.png", sizes: "192x192", type: "image/png"},
                    {src: "/pwa/sprocket_logo_256.png", sizes: "256x256", type: "image/png"},
                    {src: "/pwa/sprocket_logo_512.png", sizes: "512x512", type: "image/png"},
                ],
            },

            workbox: {
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                skipWaiting: true,
                clientsClaim: true,

                globPatterns: [
                    "**/*.webmanifest",
                    "**/*.png",
                    "**/*.svg",
                    "**/*.ico",
                ],

                globIgnores: ["sw.js", "workbox-*.js"],

                runtimeCaching: [
                    {
                        urlPattern: ({request}) =>
                            request.destination === "script" ||
                            request.destination === "style",
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "assets-cache",
                        },
                    },

                    {
                        urlPattern: ({request}) => request.destination === "image",
                        handler: "CacheFirst",
                        options: {
                            cacheName: "images-cache",
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },

                    {
                        urlPattern: ({request}) => request.mode === "navigate",
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "html-cache",
                            networkTimeoutSeconds: 10,
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 5,
                            },
                        },
                    },
                ],

                cleanupOutdatedCaches: true,
            },

            injectRegister: "auto",

            devOptions: {
                enabled: false,
            },
        })
    ],

    resolve: {
        alias: {"@": path.resolve(__dirname, "./src")},
    },

    build: {
        outDir: "dist", // make sure this matches your globDirectory
        emptyOutDir: true,
    },

    server: {
        host: true
    },
});
