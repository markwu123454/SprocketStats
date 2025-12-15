import {useEffect, useState} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {useNavigate} from "react-router-dom";
import {ArrowLeft} from "lucide-react";
import ReactJsonView from "@microlink/react-json-view";
import {getSetting, getSettingSync, type Settings} from "@/db/settingsDb.ts";
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper.tsx";

export default function DevPage() {
    const navigate = useNavigate();
    const {getMetadata, getLatency} = useAPI();

    const PLACEHOLDER = "—";

    const [storage, setStorage] = useState({
        local: {} as Record<string, string>,
        cookies: {} as Record<string, string>,
        dexiePreview: {} as Record<string, any>,
        tables: {} as Record<string, number>,
    });

    const [latency, setLatency] = useState({
        upload: PLACEHOLDER,
        download: PLACEHOLDER,
        roundTrip: PLACEHOLDER,
        dbUpload: PLACEHOLDER,
        dbDownload: PLACEHOLDER,
    });

    const [version, setVersion] = useState<Record<string, any>>({});
    const [devMetadata, setDevMetadata] = useState<Record<string, any>>({});
    const [eventNames, setEventNames] = useState<Record<string, { full: string; short: string }>>({});
    const [theme, setThemeState] = useState<Settings["theme"]>(() => getSettingSync("theme", "2026"))

    const inspectIndexedDB = async () => {
        const dbs = await indexedDB.databases();
        const preview: Record<string, any> = {};
        const counts: Record<string, number> = {};

        for (const db of dbs) {
            if (!db.name) continue;
            preview[db.name] = {};

            const openReq = indexedDB.open(db.name);
            const instance = await new Promise<IDBDatabase>((resolve, reject) => {
                openReq.onsuccess = () => resolve(openReq.result);
                openReq.onerror = () => reject(openReq.error);
            });

            for (const storeName of Array.from(instance.objectStoreNames)) {
                const store = instance.transaction(storeName, "readonly").objectStore(storeName);

                const data = await new Promise<any[]>((resolve, reject) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });

                const count = await new Promise<number>((resolve) => {
                    const cReq = store.count();
                    cReq.onsuccess = () => resolve(cReq.result);
                });

                preview[instance.name][storeName] = data;
                counts[`${instance.name}.${storeName}`] = count;
                counts[storeName] = count;
            }

            instance.close();
        }

        setStorage(prev => ({...prev, dexiePreview: preview}));
        setStorage(prev => ({...prev, tables: counts}));
        setStorage(prev => ({...prev, tables: counts}));
    };

    const testLatency = async () => {
        try {
            const samples = 5;
            const nsToMs = (ns: number) => ns / 1_000_000; // convert nanoseconds → milliseconds

            const c2s: number[] = [];
            const s2c: number[] = [];
            const rtt: number[] = [];
            const tcp: number[] = [];
            const dbq: number[] = [];

            for (let i = 0; i < samples; i++) {
                const res = await getLatency();
                if (!res) continue;

                if (res.client_to_server_ns && res.client_to_server_ns > 0)
                    c2s.push(nsToMs(res.client_to_server_ns));

                if (res.server_to_client_ns && res.server_to_client_ns > 0)
                    s2c.push(nsToMs(res.server_to_client_ns));

                if (res.roundtrip_ns && res.roundtrip_ns > 0)
                    rtt.push(nsToMs(res.roundtrip_ns));

                const db = res.db_latency;
                if (db?.tcp_latency_ns && db.tcp_latency_ns > 0)
                    tcp.push(nsToMs(db.tcp_latency_ns));

                if (db?.db_query_latency_ns && db.db_query_latency_ns > 0)
                    dbq.push(nsToMs(db.db_query_latency_ns));
            }

            const avg = (arr: number[]) =>
                arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

            setLatency({
                upload: avg(c2s) !== null ? `${avg(c2s)?.toFixed(0)} ms` : PLACEHOLDER,
                download: avg(s2c) !== null ? `${avg(s2c)?.toFixed(0)} ms` : PLACEHOLDER,
                roundTrip: avg(dbq) !== null ? `${avg(rtt)?.toFixed(0)} ms` : PLACEHOLDER,
                dbUpload: avg(tcp) !== null ? `${avg(tcp)?.toFixed(0)} ms` : PLACEHOLDER,
                dbDownload: avg(dbq) !== null ? `${avg(dbq)?.toFixed(0)} ms` : PLACEHOLDER,
            });

        } catch (err) {
            console.error("Latency test failed:", err);
            setLatency({
                upload: PLACEHOLDER,
                download: PLACEHOLDER,
                roundTrip: PLACEHOLDER,
                dbUpload: PLACEHOLDER,
                dbDownload: PLACEHOLDER,
            });
        }
    };

    // --- effects ---
    useEffect(() => {
        (async () => {
            const res = await fetch("/api/version");
            const data = await res.json();
            setVersion(data);
        })();
    }, []);

    useEffect(() => {
        const load = async () => {
            const t = await getSetting("theme")
            if (t) setThemeState(t)
        }
        void load()
    }, [])

    useEffect(() => {
        (async () => {
            const local: Record<string, string> = {};
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i)!;
                local[key] = window.localStorage.getItem(key)!;
            }

            const cookies: Record<string, string> = {};
            document.cookie.split("; ").forEach(c => {
                const [name, ...rest] = c.split("=");
                if (name) cookies[name] = rest.join("=");
            });

            setStorage(prev => ({...prev, local, cookies}));

            try {
                const meta = await getMetadata();
                setDevMetadata(meta);
                setStorage(prev => ({...prev, tables: meta.kpis ?? {},}));
            } catch {
            }

            const nameRes = await fetch("/teams/event_names.json");
            setEventNames(await nameRes.json());

            void inspectIndexedDB();
        })();
    }, []);

    return (
        <HeaderFooterLayoutWrapper
            header={
                <>
                    <button onClick={() => navigate("/")}
                            className="flex items-center gap-2 hover:opacity-80 transition">
                        <ArrowLeft className="w-5 h-5"/>
                        <span className="text-sm font-medium">Back</span>
                    </button>

                    <div className="flex-1 text-center min-w-0">
                        <p className="text-lg font-bold">Developer Dashboard</p>
                        <p className="text-xs opacity-70 truncate">
                            Active Event: {eventNames?.[devMetadata["current_event"]]?.full ?? "-"}
                        </p>
                    </div>

                    <div className="text-xs opacity-70 text-right whitespace-nowrap flex-shrink-0">
                        Event Key: {devMetadata.current_event ?? PLACEHOLDER}
                    </div>
                </>
            }
            body={

                <section className="space-y-4 min-w-0">

                    {/* LOCAL STORAGE CARD */}
                    <div className="border rounded-xl p-4 theme-bg theme-border">

                        <h3 className="text-xs font-semibold uppercase opacity-70">Local Storage</h3>

                        <div
                            className="max-h-32 overflow-auto border rounded-xl p-2 my-2 text-xs theme-bg theme-border theme-scrollbar">

                            {Object.keys(storage.local).length === 0 &&
                                <p className="opacity-60">No LocalStorage keys found.</p>}

                            {Object.entries(storage.local).map(([k, v]) => (
                                <div key={k}
                                     className="flex justify-between border-b py-1 truncate min-w-0 theme-border">
                                    <span className="truncate max-w-[75%]">{k}: {v}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COOKIES CARD */}
                    <div className="border rounded-xl p-4 theme-bg theme-border">

                        <h3 className="text-xs font-semibold uppercase opacity-70">Cookies</h3>

                        <div
                            className="max-h-32 overflow-auto border rounded-xl p-2 my-2 text-xs theme-bg theme-border theme-scrollbar">

                            {Object.keys(storage.cookies).length === 0 &&
                                <p className="opacity-60">No cookies found.</p>}

                            {Object.entries(storage.cookies).map(([k, v]) => (
                                <div key={k}
                                     className="border-b py-1 truncate max-w-full min-w-0 theme-border">{k}: {v}</div>
                            ))}
                        </div>
                    </div>

                    {/* INDEXED DB CARD */}
                    <div className="border rounded-xl p-4 theme-bg theme-border">

                        <h3 className="text-xs font-semibold uppercase opacity-70">Indexed DB(Dexie DB)</h3>

                        <div
                            className="border rounded-xl p-4 min-h-32 overflow-auto text-xs my-2 backdrop-blur-sm theme-bg theme-border"
                        >

                            {Object.keys(storage.dexiePreview).length > 0 ? (
                                <ReactJsonView
                                    src={storage.dexiePreview}
                                    collapsed={2}
                                    theme={theme === "2025" || theme === "3473" || theme === "dark" ? "harmonic" : "rjv-default"}
                                    style={{
                                        backgroundColor: "transparent",
                                        fontSize: "0.75rem",
                                        lineHeight: 1.4,
                                        color: theme === "2025" || theme === "3473" || theme === "dark" ? "#fafafa" : "#18181b",
                                    }}
                                    iconStyle="circle"
                                    displayDataTypes={false}
                                    indentWidth={2}
                                    enableClipboard={false}
                                />
                            ) : (
                                <p className="opacity-60">No JSON storage preview available.</p>
                            )}

                        </div>
                    </div>

                    {/* NETWORK LATENCY CARD */}
                    <div className="border rounded-xl p-4 theme-bg theme-border">

                        <h3 className="text-xs font-semibold uppercase opacity-70">Database & Network Latency</h3>

                        <div className="space-y-2 my-2 text-xs">
                            <p className="opacity-70">Client → Server (Upload): {latency.upload}</p>
                            <p className="opacity-70">Server → Client (Download): {latency.download}</p>
                            <p className="opacity-70">DB TCP Handshake: {latency.dbUpload}</p>
                            <p className="opacity-70">DB Query Time: {latency.dbDownload}</p>
                            <p className="opacity-70">Round Trip time: {latency.roundTrip}</p>
                        </div>

                        <button onClick={testLatency}
                                className="w-full p-4 border rounded-xl text-xs transition hover:bg-white/10 theme-border">
                            Test Latency
                        </button>
                    </div>

                    {/* DEPLOYMENT OVERVIEW CARD */}
                    <div className="p-4 rounded-xl border theme-bg theme-border">

                        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">
                            Deployment Overview
                        </h3>

                        {/* Compact multi-column grid for curated fields */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-medium">
                            <div>Environment: {version.NODE_ENV ?? PLACEHOLDER}</div>
                            <div>Vercel Env: {version.VERCEL_ENV ?? PLACEHOLDER}</div>
                            <div>Region: {version.VERCEL_REGION ?? PLACEHOLDER}</div>
                            <div>URL: {version.VERCEL_URL ?? PLACEHOLDER}</div>
                            <div>Preview: {String(version.VERCEL_IS_PREVIEW ?? false)}</div>
                            <div>Branch: {version.VERCEL_GIT_COMMIT_REF ?? PLACEHOLDER}</div>
                            <div>Commit: {version.VERCEL_GIT_COMMIT_SHA_SHORT ?? PLACEHOLDER}</div>
                            <div>Author: {version.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? PLACEHOLDER}</div>
                            <div>Repo Owner: {version.VERCEL_GIT_REPO_OWNER ?? PLACEHOLDER}</div>
                            <div>Repo Slug: {version.VERCEL_GIT_REPO_SLUG ?? PLACEHOLDER}</div>
                            <div>Project ID: {version.VERCEL_PROJECT_ID ?? PLACEHOLDER}</div>
                            <div>Deployment ID: {version.VERCEL_DEPLOYMENT_ID ?? PLACEHOLDER}</div>
                            <div>Provider: {version.VERCEL_GIT_PROVIDER ?? PLACEHOLDER}</div>
                            <div>Build time: {version.BUILD_TIME ?? PLACEHOLDER}</div>
                            <div>Deploy time: {version.DEPLOY_TIME ?? PLACEHOLDER}</div>
                            <div>Runtime: {version.VERCEL_RUNTIME ?? PLACEHOLDER}</div>
                            <div>Config File: {version.VERCEL_CONFIG_FILE ?? PLACEHOLDER}</div>
                            <div>Preview Mode: {String(version.VERCEL_IS_PREVIEW ?? false)}</div>
                        </div>

                    </div>

                </section>
        }
            footer={
                <>
                    <a href="/" className="truncate min-w-0 underline max-w-[40%]">
                        Frontend URL
                    </a>

                    <div className="text-right opacity-70 whitespace-nowrap overflow-hidden flex-shrink-0">
                        <p>Branch: {version.VERCEL_GIT_COMMIT_REF ?? PLACEHOLDER}</p>
                        <p>Commit: {version.VERCEL_GIT_COMMIT_SHA_SHORT ?? PLACEHOLDER}</p>
                    </div>
                </>
            }
        />
    )
}