import {useMemo, useState, useRef, useEffect} from "react";
import Fuse from "fuse.js";

interface NameSearchProps {
    names: string[];
    value: string | null;
    onChange: (name: string | null) => void;
    placeholder?: string;
}

export default function NameSearch({names, value, onChange, placeholder = "Search your name…"}: NameSearchProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    /* ---------------- Click Outside ---------------- */

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery("");
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    /* ---------------- Fuse Index ---------------- */

    const sortedNames = useMemo(() => [...names].sort((a, b) => a.localeCompare(b)), [names]);

    const fuse = useMemo(() => new Fuse(sortedNames, {
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 1,
    }), [sortedNames]);

    const results = useMemo(() => {
        if (!query.trim()) return sortedNames;
        return fuse.search(query).map(r => r.item);
    }, [query, fuse, sortedNames]);

    /* ---------------- Selection ---------------- */

    function select(name: string) {
        onChange(name);
        setOpen(false);
        setQuery("");
    }

    /* ---------------- Keyboard Handling ---------------- */

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!open) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setActiveIndex(prev => Math.min(prev + 1, results.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setActiveIndex(prev => Math.max(prev - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                if (results[activeIndex] !== undefined) {
                    select(results[activeIndex]);
                }
                break;
            case "Escape":
                e.preventDefault();
                setOpen(false);
                setQuery("");
                inputRef.current?.blur();
                break;
        }
    }

    /* ---------------- Render ---------------- */

    const displayValue = open ? query : (value ?? "");

    return (
        <div ref={containerRef} className="relative w-full">
            <input
                ref={inputRef}
                value={displayValue}
                placeholder={placeholder}
                onChange={e => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                }}
                onFocus={() => {
                    setQuery("");
                    setOpen(true);
                    setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className="w-full rounded bg-zinc-800 border border-zinc-700 text-white text-lg p-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />

            {open && results.length > 0 && (
                <div
                    className="absolute left-0 z-50 mt-1 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800 shadow-lg"
                    style={{maxHeight: 5 * 40}}
                >
                    {results.map((name, index) => (
                        <div
                            key={name}
                            onMouseDown={e => {
                                e.preventDefault();
                                select(name);
                            }}
                            className={`px-3 py-2 text-sm cursor-pointer transition
                                ${index === activeIndex ? "bg-zinc-600 text-white" : "hover:bg-zinc-700 text-white"}`}
                        >
                            {name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
