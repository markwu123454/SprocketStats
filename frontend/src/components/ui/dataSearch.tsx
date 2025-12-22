import {useMemo, useState, useRef, useEffect} from "react";
import {useNavigate} from "react-router-dom";
import Fuse from "fuse.js";
import type {GuestPermissions} from "@/components/wrappers/DataWrapper.tsx";

type Permissions = GuestPermissions | null;

const EMPTY_PERMISSIONS: GuestPermissions = {
    ranking: false,
    alliance: false,
    match: [],
    team: [],
};

type SearchItemType = "team" | "match" | "page";

interface SearchItem {
    id: string;
    type: SearchItemType;
    label: string;
    route: string;
    keywords: string[];
}

interface DataSearchProps {
    teamNames: Record<number, string> | null;
    permissions: Permissions | null;
}

const MAX_VISIBLE_RESULTS = 4;

export default function DataSearch({
                                       teamNames,
                                       permissions,
                                   }: DataSearchProps) {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const safeTeamNames: Record<string, string> = teamNames ?? {};
    const safePermissions: GuestPermissions = permissions ?? EMPTY_PERMISSIONS;


    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);


    /* ---------------- Search Index ---------------- */

    const searchIndex = useMemo<SearchItem[]>(() => {
        const items: SearchItem[] = [];

        /* Teams */
        if (Array.isArray(safePermissions.team)) {
            for (const teamNumber of safePermissions.team) {
                const name = safeTeamNames[teamNumber];
                if (!name) continue;

                items.push({
                    id: `team-${teamNumber}`,
                    type: "team",
                    label: `${teamNumber} – ${name}`,
                    route: `/data/team/${teamNumber}`,
                    keywords: [
                        teamNumber.toString(),
                        name.toLowerCase(),
                    ],
                });
            }
        }

        /* Matches */
        if (Array.isArray(safePermissions.match)) {
            for (const matchKey of safePermissions.match) {
                items.push({
                    id: `match-${matchKey}`,
                    type: "match",
                    label: matchKey.toUpperCase(),
                    route: `/data/match/${matchKey}`,
                    keywords: normalizeMatchKeywords(matchKey),
                });
            }
        }

        /* Pages */
        if (safePermissions.ranking) {
            items.push({
                id: "page-ranking",
                type: "page",
                label: "Team Rankings",
                route: "/data/ranking",
                keywords: ["ranking", "rank", "standings"],
            });
        }

        if (safePermissions.alliance) {
            items.push({
                id: "page-alliance",
                type: "page",
                label: "Alliance Selection Simulator",
                route: "/data/alliance-sim",
                keywords: ["alliance", "sim", "simulation"],
            });
        }

        return items;
    }, [safeTeamNames, safePermissions]);

    /* ---------------- Query Matching ---------------- */

    const fuse = useMemo(() => {
        return new Fuse(searchIndex, {
            keys: [
                {name: "label", weight: 0.6},
                {name: "keywords", weight: 0.4},
            ],
            threshold: 0.35,      // lower = stricter
            ignoreLocation: true,
            minMatchCharLength: 1,
        });
    }, [searchIndex]);


    const results = useMemo(() => {
        if (!query.trim()) return [];

        return fuse
            .search(query)
            .slice(0, 25) // scroll cap
            .map(r => ({
                item: r.item,
            }));
    }, [query, fuse]);


    /* ---------------- Navigation ---------------- */

    function select(item: SearchItem) {
        setOpen(false);
        setQuery("");
        navigate(item.route);
    }

    /* ---------------- Render ---------------- */

    return (
        <div ref={containerRef} className="relative w-72">
            <input
                ref={inputRef}
                value={query}
                onChange={e => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setActiveIndex(0);
                }}
                onFocus={() => {
                    if (query.trim()) {
                        setOpen(true);
                    }
                }}
                placeholder="Search teams, matches…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
            />

            {open && results.length > 0 && (
                <div
                    className="absolute left-0 z-50 mt-1 w-full overflow-y-auto rounded-md border border-border bg-background shadow-lg"
                    style={{maxHeight: MAX_VISIBLE_RESULTS * 36}}
                >

                    {results.map(({item}, index) => (
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
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition 
            ${
                active
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
            }
            `}
        >
            <span
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground w-14 text-center">
                {item.type}
            </span>

            <span className="truncate">{item.label}</span>
        </div>
    );
}


/* ---------------- Utilities ---------------- */

function normalizeMatchKeywords(matchKey: string): string[] {
    const base = matchKey.toLowerCase();

    const num = base.replace(/\D/g, "");

    const keywords = new Set<string>([
        base,
        `match ${num}`,
        `qual ${num}`,
        `qualification ${num}`,
        `qm${num}`,
        `sf${num}`,
        `f${num}`,
    ]);

    return Array.from(keywords);
}
