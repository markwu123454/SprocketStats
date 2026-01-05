import {useMemo, useState, useRef, useEffect} from "react";
import Fuse, {type IFuseOptions} from "fuse.js";

export type SearchItemType = string;

export interface SearchItem {
    id: string;
    label: string;
    value: unknown;
    type?: SearchItemType;
    keywords?: string[];
}

interface SearchDropdownProps {
    items: SearchItem[];
    onSelect: (item: SearchItem) => void;

    placeholder?: string;
    maxVisibleResults?: number;

    fuseOptions?: IFuseOptions<SearchItem>;
    className?: string;
}

export default function SearchDropdown({
                                           items,
                                           onSelect,
                                           placeholder = "Search…",
                                           maxVisibleResults = 4,
                                           fuseOptions,
                                           className,
                                       }: SearchDropdownProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    /* ---------------- Click Outside ---------------- */

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    /* ---------------- Fuse Index ---------------- */

    const fuse = useMemo(() => {
        return new Fuse(items, {
            keys: [
                {name: "label", weight: 0.6},
                {name: "keywords", weight: 0.4},
            ],
            threshold: 0.35,
            ignoreLocation: true,
            minMatchCharLength: 1,
            ...fuseOptions,
        });
    }, [items, fuseOptions]);

    const results = useMemo(() => {
        if (!query.trim()) {
            return items;
        }

        return fuse
            .search(query)
            .slice(0, 25)
            .map(r => r.item);
    }, [query, fuse, items]);


    /* ---------------- Selection ---------------- */

    function select(item: SearchItem) {
        setOpen(false);
        setQuery("");
        onSelect(item);
    }


    /* ---------------- Render ---------------- */

    return (
        <div ref={containerRef} className={`relative w-full h-full ${className ?? ""}`}>
            <input
                ref={inputRef}
                value={query}
                placeholder={placeholder}
                onChange={e => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setActiveIndex(0);
                }}
                onFocus={() => setOpen(true)}
                className="w-full h-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
            />

            {open && results.length > 0 && (
                <div
                    className="absolute left-0 z-50 mt-1 w-full overflow-y-auto rounded-md border border-border bg-background shadow-lg"
                    style={{maxHeight: maxVisibleResults * 36}}
                >
                    {results.map((item, index) => (
                        <SearchRow
                            key={item.id}
                            item={item}
                            active={index === activeIndex}
                            onClick={() => select(item)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ---------------- Result Row ---------------- */

function SearchRow({
                       item,
                       active,
                       onClick,
                   }: {
    item: SearchItem;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <div
            onMouseDown={e => {
                e.preventDefault();
                onClick();
            }}
            className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition
            ${active ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
        >
            {item.type && (
                <span
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground w-14 text-center">
                    {item.type}
                </span>
            )}

            <span className="truncate">{item.label}</span>
        </div>
    );
}
