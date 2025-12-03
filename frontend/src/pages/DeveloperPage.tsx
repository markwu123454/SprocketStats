import {useEffect, useState} from "react";
import {useAPI} from "@/hooks/useAPI.ts";
import {useNavigate} from "react-router-dom";
import {ArrowLeft} from "lucide-react";
import ReactJsonView from "@microlink/react-json-view";

export default function DevPage() {
    const navigate = useNavigate();
    const {get_metadata} = useAPI();

    const [frontendInfo, setFrontendInfo] = useState({
        branch: "—",
        commit: "—",
        message: "—",
        deployTime: "—",
        env: "—"
    });

    const [backendInfo, setBackendInfo] = useState({branch: "—", commit: "—", message: "—", deployTime: "—", env: "—"});

    const [storage, setStorage] = useState<{
        local: Record<string, string>,
        cookies: Record<string, string>,
        dexie: any[],
        tables?: Record<string, number>,
        dexiePreview?: Record<string, any>
    }>({local: {}, cookies: {}, dexie: [], tables: {}, dexiePreview: {}});

    const [latency, setLatency] = useState({upload: "—", download: "—", dbUpload: "—", dbDownload: "—"});
    const [selectedLocalKey, setSelectedLocalKey] = useState("");

    const inspectIndexedDB = async () => {
        const dbs = await indexedDB.databases();
        const results: Record<string, any> = {};
        const tableCounts: Record<string, number> = {};

        for (const db of dbs) {
            if (!db.name) continue;

            results[db.name] = {};
            const openReq = indexedDB.open(db.name);

            const dbInstance = await new Promise<IDBDatabase>((resolve, reject) => {
                openReq.onsuccess = () => resolve(openReq.result);
                openReq.onerror = () => reject(openReq.error);
            });

            for (const storeName of Array.from(dbInstance.objectStoreNames)) {
                const tx = dbInstance.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const data = await new Promise<any[]>((resolve, reject) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });

                const count = await new Promise<number>(resolve => {
                    const cReq = store.count();
                    cReq.onsuccess = () => resolve(cReq.result);
                });

                results[dbInstance.name][storeName] = data;
                tableCounts[`${dbInstance.name}.${storeName}`] = count;
                tableCounts[storeName] = count;
            }

            dbInstance.close();
        }

        setStorage(prev => ({
            ...prev,
            tables: tableCounts,
            dexiePreview: results,
            dexie: []
        }));
    };

    function inspectStore(key: string) {
        const fullKey = key.includes(".") ? key : key;
        const [dbName, storeName] = fullKey.split(".");
        const data = storage.dexiePreview?.[dbName]?.[storeName];
        if (!data) {
            alert("No data found");
            return;
        }
        alert(JSON.stringify(data, null, 2));
    }

    function clearLocalKey(key: string) {
        localStorage.removeItem(key);
        const updated = {...storage.local};
        delete updated[key];
        setStorage(prev => ({...prev, local: updated}));
    }

    function clearAllLocal() {
        localStorage.clear();
        setStorage(prev => ({...prev, local: {}}));
    }

    function clearAllCookies() {
        document.cookie.split("; ").forEach(c => {
            const name = c.split("=")[0];
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        });
        setStorage(prev => ({...prev, cookies: {}}));
    }

    async function testLatency() {
        const t0 = performance.now();
        await fetch("/ping");
        const t1 = performance.now();
        setLatency({
            upload: `${(t1 - t0).toFixed(2)}ms`,
            download: `${(t1 - t0).toFixed(2)}ms`,
            dbUpload: "—",
            dbDownload: "—"
        });
    }

    useEffect(() => {
        setFrontendInfo({
            branch: "main",
            commit: "abc1234",
            message: "Initial deploy",
            deployTime: new Date().toISOString(),
            env: process.env.NODE_ENV || "—"
        });
    }, []);

    useEffect(() => {
        void (async () => {
            const versionRes = await fetch("/api/version");
            const data = await versionRes.json();
            setBackendInfo({
                branch: data.branch ?? "—",
                commit: data.commit ?? "—",
                message: data.commit_message ?? "—",
                deployTime: data.deploy_time ?? "—",
                env: data.environment ?? "—"
            });

            const localData: Record<string, string> = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)!;
                localData[key] = localStorage.getItem(key)!;
            }

            const cookieData: Record<string, string> = {};
            document.cookie.split("; ").forEach(c => {
                const [name, ...rest] = c.split("=");
                if (name) cookieData[name] = rest.join("=");
            });

            setStorage(prev => ({...prev, local: localData, cookies: cookieData}));
        })();
    }, []);

    return (
        <div className="min-h-screen relative text-sm
      theme-light:text-zinc-900
      theme-dark:text-white
      theme-2025:text-white
      theme-2026:text-[#3b2d00]
      theme-3473:text-white">

            <div className="absolute inset-0 bg-top bg-cover
        theme-light:bg-zinc-100
        theme-dark:bg-zinc-950
        theme-2025:bg-[url('/seasons/2025/expanded.png')]
        theme-2026:bg-[url('/seasons/2026/expanded.png')]
        theme-3473:bg-[radial-gradient(80%_110%_at_10%_10%,#4c2c7a,#1f0b46),linear-gradient(135deg,#140a2a,#1f0b46)]"/>

            <div className="relative z-10 flex flex-col min-h-screen">

                <section className="p-2 h-10 text-xl flex items-center
          theme-light:bg-[#ffffff]/75
          theme-dark:bg-[rgba(9,9,11,0.7)]
          theme-2025:bg-[rgba(11,35,79,0.7)]
          theme-2026:bg-[rgba(254,247,220,0.8)]
          theme-3473:bg-[rgba(76,29,149,0.75)]">
                    <button onClick={() => navigate("/")} className="transition hover:opacity-80" title="Back"
                            type="button">
                        <ArrowLeft className="ml-5 w-5 h-5 mr-5"/>
                    </button>
                    <span className="text-base font-bold px-5">Developer Info Dashboard</span>
                </section>

                <main className="flex-1 p-4 space-y-6 backdrop-blur-sm">

                    <section className="rounded-xl border p-4 shadow-md
            theme-light:bg-white/35 theme-dark:bg-zinc-900/30">
                        <h2 className="text-lg font-bold mb-2">Quick Links</h2>
                        <ul className="space-y-1">
                            <li><a href="/" className="underline">Frontend URL</a></li>
                            <li><a href="/api" className="underline">Backend URL</a></li>
                            <li><a href="https://vercel.com" target="_blank" className="underline">Vercel Deployment</a></li>
                            <li><a href="https://render.com" target="_blank" className="underline">Render Deployment</a></li>
                            <li><a href="https://github.com" target="_blank" className="underline">GitHub Repository</a></li>
                            <li><a href="https://console.neon.tech" target="_blank" className="underline">Neon DB Console</a></li>
                        </ul>
                    </section>

                    <section className="p-4 border-b
    theme-light:border-zinc-300
    theme-dark:border-zinc-800
    theme-2025:border-[#1b3d80]
    theme-2026:border-[#e6ddae]
    theme-3473:border-[#6d28d9]">

                        <h2 className="text-base font-bold uppercase opacity-80 mb-2">Storage Inspector</h2>

                        {/* LocalStorage */}
                        <div className="mb-4">
                            <h3 className="text-xs font-semibold uppercase opacity-70">LocalStorage</h3>
                            <div className="max-h-32 overflow-auto border rounded-xl p-2 my-2">
                                {Object.entries(storage.local).map(([k, v]) => (
                                    <div key={k} className="flex justify-between border-b py-1">
                                        <span>{k}: {v}</span>
                                        <button onClick={() => clearLocalKey(k)} className="text-xs">Clear</button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={clearAllLocal} className="px-2 py-1 border rounded-xl text-xs mr-2">Clear
                                All
                            </button>
                            <button className="px-2 py-1 border rounded-xl text-xs mr-2">Export
                                All
                            </button>
                        </div>

                        {/* Cookies */}
                        <div className="mb-4">
                            <h3 className="text-xs font-semibold uppercase opacity-70">Cookies</h3>
                            <div className="max-h-32 overflow-auto border rounded-xl p-2 my-2">
                                {Object.entries(storage.cookies).map(([k, v]) => (
                                    <div key={k} className="border-b py-1">{k}: {v}</div>
                                ))}
                            </div>
                            <button onClick={clearAllCookies} className="px-2 py-1 border rounded-xl text-xs">Clear Cookies</button>
                        </div>

                        {/* IndexedDB */}
                        <div>
                            <h3 className="text-xs font-semibold uppercase opacity-70">IndexedDB</h3>
                            <button onClick={inspectIndexedDB}
                                    className="w-full px-2 py-1 border rounded-xl text-xs mb-2">Inspect IndexedDB
                            </button>

                            <div className="max-h-48 overflow-auto border rounded-xl p-2 my-2">
                                {Object.entries(storage.tables || {}).map(([k, count]) => (
                                    <div key={k} className="flex justify-between border-b py-1 cursor-pointer"
                                         onClick={() => inspectStore(k)}>
                                        <span>{k}: {count} records</span>
                                    </div>
                                ))}
                            </div>

                            <div className="border rounded-xl p-2 min-h-32 overflow-auto backdrop-blur-sm">
                                {storage.dexiePreview && Object.keys(storage.dexiePreview).length > 0 && (
                                    <ReactJsonView
                                        src={storage.dexiePreview}
                                        displayDataTypes={false}
                                        collapsed={2}
                                        theme="apathy"
                                    />
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    indexedDB.databases().then(dbs =>
                                        dbs.forEach(db => {
                                            if (db.name) indexedDB.deleteDatabase(db.name);
                                        })
                                    );
                                    clearAllCookies();
                                    clearAllLocal();
                                }}
                                className="mt-2 w-full p-2 border rounded-xl text-xs transition hover:opacity-80"
                            >
                                Clear All Storage
                            </button>

                        </div>

                    </section>

                </main>

                <footer className="pt-2 h-10
          theme-light:bg-[#ffffff]/75
          theme-dark:bg-[rgba(9,9,11,0.7)]
          theme-2025:bg-[rgba(11,35,79,0.7)]
          theme-2026:bg-[rgba(254,247,220,0.8)]
          theme-3473:bg-[rgba(76,29,149,0.7)]
          flex items-center justify-between px-4 text-xs font-semibold tracking-wide">
                    <div><a href="https://neon.com" target="_blank" className="underline">Neon Console</a></div>
                    <div className="text-right opacity-70"><p>System Diagnostic Panel</p></div>
                </footer>

            </div>
        </div>
    );
}
