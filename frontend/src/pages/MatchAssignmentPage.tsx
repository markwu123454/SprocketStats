import {ArrowLeft} from "lucide-react";
import {useEffect, useMemo, useState} from "react";
import {useAPI} from "@/hooks/useAPI";
import {AgGridReact, type CustomCellEditorProps} from "ag-grid-react";
import {type ColDef, type CellValueChangedEvent, themeQuartz} from "ag-grid-community";
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper";
import SearchDropdown, {type SearchItem} from "@/components/ui/searchDropdown";
import type {MatchType} from "@/types";

// ---------------------------
// Types
// ---------------------------
type MatchRow = {
    key: string;
    event_key: string;
    match_type: MatchType;
    match_number: number;
    set_number: number;
    scheduled_time: string | null;
    actual_time: string | null;
    red1: number | null;
    red2: number | null;
    red3: number | null;
    blue1: number | null;
    blue2: number | null;
    blue3: number | null;
    red1_scouter: string | null;
    red2_scouter: string | null;
    red3_scouter: string | null;
    blue1_scouter: string | null;
    blue2_scouter: string | null;
    blue3_scouter: string | null;
};

type Scouter = {
    email: string;
    name: string;
};

type DirtyCell = {
    rowKey: string;
    colId: string;
    oldValue: string | number | null | undefined;
    newValue: string | number | null;
};

// ---------------------------
// Custom Scouter Editor (REACTIVE API)
// ---------------------------
type ScouterEditorProps =
    CustomCellEditorProps<string | null> & {
    scouters: Scouter[];
};

const ScouterCellEditor = ({
                               value,
                               onValueChange,
                               stopEditing,
                               scouters,
                           }: ScouterEditorProps) => {
    const items: SearchItem[] = scouters.map(s => ({
        id: s.email,
        label: s.name,
        value: s.email,
        keywords: [s.email],
    }));

    // Find current scouter name for placeholder
    const currentScouterName =
        value
            ? scouters.find(s => s.email === value)?.name ?? value
            : undefined;

    function handleSelect(item: SearchItem) {
        onValueChange(item.value); // commit value to AG Grid
        stopEditing();
    }

    return (
        <SearchDropdown
            items={items}
            onSelect={handleSelect}
            placeholder={currentScouterName ? `replace ${currentScouterName} with...` : "Assign scouter…"}
            maxVisibleResults={6}
        />
    );
};


// ---------------------------
// Page Component
// ---------------------------
export default function MatchAssignmentPage() {
    const {getAllMatches, updateMatchSchedule} = useAPI();

    const [rowData, setRowData] = useState<MatchRow[]>([]);
    const [scouters, setScouters] = useState<Scouter[]>([]);
    const [dirtyCells, setDirtyCells] = useState<Map<string, DirtyCell>>(new Map());
    const [originalRows, setOriginalRows] = useState<Map<string, MatchRow>>(new Map());

    // Load matches + scouters
    useEffect(() => {
        const load = async () => {
            const res = await getAllMatches();
            if (!res) return;
            setRowData(res.matches);
            setOriginalRows(new Map(res.matches.map(row => [row.key, {...row}])));
            setScouters(res.scouters);
        };
        void load();
    }, []);

    // Map email → name for display
    const scouterNameByEmail = useMemo(
        () => Object.fromEntries(scouters.map(s => [s.email, s.name])),
        [scouters]
    );

    const makeDirtyKey = (rowKey: string, colId: string) =>
        `${rowKey}::${colId}`;

    const defaultColDef: ColDef = {
        cellClassRules: {
            "bg-yellow-100": params =>
                dirtyCells.has(`${params.data.key}::${params.colDef.field}`),
        },
    };

    // Helper for scouter columns
    const scouterColumn = (header: string, field: keyof MatchRow): ColDef => ({
        headerName: header,
        field,
        width: 130,
        editable: true,
        cellEditor: ScouterCellEditor,
        cellEditorPopup: true,
        cellEditorParams: {scouters},
        valueFormatter: params =>
            params.value ? scouterNameByEmail[params.value] ?? params.value : "",
    });

    // Column definitions
    const columnDefs: ColDef[] = [
        {headerName: "Type", field: "match_type", width: 65},
        {headerName: "Match", field: "match_number", width: 75},
        // {headerName: "Set", field: "set_number", width: 55}, set_number should be 1 at all times

        {headerName: "Scheduled", field: "scheduled_time", width: 200, editable: true, cellDataType: "dateTimeString"},
        {headerName: "Actual", field: "actual_time", width: 200, editable: true, cellDataType: "dateTimeString"},

        {headerName: "Red 1", field: "red1", width: 75, editable: true},
        {headerName: "Red 2", field: "red2", width: 75, editable: true},
        {headerName: "Red 3", field: "red3", width: 75, editable: true},

        scouterColumn("Red 1 Scouter", "red1_scouter"),
        scouterColumn("Red 2 Scouter", "red2_scouter"),
        scouterColumn("Red 3 Scouter", "red3_scouter"),

        {headerName: "Blue 1", field: "blue1", width: 75, editable: true},
        {headerName: "Blue 2", field: "blue2", width: 75, editable: true},
        {headerName: "Blue 3", field: "blue3", width: 75, editable: true},

        scouterColumn("Blue 1 Scouter", "blue1_scouter"),
        scouterColumn("Blue 2 Scouter", "blue2_scouter"),
        scouterColumn("Blue 3 Scouter", "blue3_scouter"),
    ];

    // Track edited rows
    const onCellValueChanged = (
        params: CellValueChangedEvent<MatchRow>
    ) => {

        const rowKey = params.data.key;
        const colId = params.colDef.field;

        if (!colId) return;

        const dirtyKey = makeDirtyKey(rowKey, colId);
        const originalRow = originalRows.get(rowKey);
        const originalValue = originalRow?.[colId as keyof MatchRow];

        setDirtyCells(prev => {
            const next = new Map(prev);

            // If reverted to original value → clear dirty state
            if (String(params.newValue ?? "") === String(originalValue ?? "")) {
                next.delete(dirtyKey);
                return next;
            }

            next.set(dirtyKey, {
                rowKey,
                colId,
                oldValue: originalValue,
                newValue: params.newValue,
            });

            return next;
        });
    };


    const buildPatchPayload = (): {
        key: string;
        scheduled_time: string | null;
        actual_time: string | null;
        red1: number | null;
        red2: number | null;
        red3: number | null;
        blue1: number | null;
        blue2: number | null;
        blue3: number | null;
        red1_scouter: string | null;
        red2_scouter: string | null;
        red3_scouter: string | null;
        blue1_scouter: string | null;
        blue2_scouter: string | null;
        blue3_scouter: string | null;
    }[] => {
        const rows = new Map<string, Partial<MatchRow>>();

        for (const dirty of dirtyCells.values()) {
            if (!rows.has(dirty.rowKey)) {
                rows.set(dirty.rowKey, {key: dirty.rowKey});
            }

            rows.get(dirty.rowKey)![dirty.colId as keyof MatchRow] =
                dirty.newValue as any;
        }

        return Array.from(rows.values()) as any;
    };

    const handleSaveChanges = async () => {
        if (dirtyCells.size === 0) return;

        const payload = buildPatchPayload();
        const res = await updateMatchSchedule(payload);

        if (!res) return;

        // Commit changes as new baseline
        setOriginalRows(
            new Map(rowData.map(r => [r.key, {...r}]))
        );
        setDirtyCells(new Map());
    };


    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center gap-4 text-lg font-semibold">
                    <a href="/" className="flex items-center p-2 rounded-md theme-hover">
                        <ArrowLeft className="h-5 w-5"/>
                    </a>

                    <span>Match Assignments</span>

                    <span className="ml-4 text-sm font-normal text-muted-foreground">
                        {dirtyCells.size} change{dirtyCells.size === 1 ? "" : "s"}
                    </span>

                    <button
                        onClick={handleSaveChanges}
                        disabled={dirtyCells.size === 0}
                        className="ml-auto px-4 py-1.5 rounded-md text-sm font-medium
                       bg-primary text-primary-foreground
                       disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Save changes
                    </button>
                </div>
            }
            body={
                <div className="w-full h-full rounded-md shadow-sm">
                    <AgGridReact
                        theme={themeQuartz}
                        rowData={rowData}
                        columnDefs={columnDefs}
                        defaultColDef={defaultColDef}
                        rowHeight={36}
                        animateRows
                        singleClickEdit
                        stopEditingWhenCellsLoseFocus
                        onCellValueChanged={onCellValueChanged}
                        getRowId={p => p.data.key}
                    />
                </div>
            }
        />
    );
}
