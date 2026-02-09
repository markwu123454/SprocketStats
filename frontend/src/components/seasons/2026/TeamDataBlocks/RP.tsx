// src/pages/blocks/RPCriteriaBlock.tsx
import {useEffect, useMemo, useState} from "react"
import {AgGridReact} from "ag-grid-react"
import {SquareCheckBig, SquareX} from "lucide-react"

export default function RPCriteriaBlock({data}: any) {
    const rp = data.rp ?? {}
    const [colDefs, setColDefs] = useState<any[]>([])
    const [rowData, setRowData] = useState<any[]>([])

    const rpData = useMemo(() =>
        Object.entries(rp).map(([match, rpValue]) => ({
            Match: match,
            ...(typeof rpValue === 'object' && rpValue !== null ? rpValue : {}),
        })),
        [rp]
    )

    useEffect(() => {
        if (!rpData || !Array.isArray(rpData) || rpData.length === 0) {
            setColDefs([])
            setRowData([])
            return
        }

        // Recursively flatten nested objects
        const flattenObject = (obj: any, prefix = ""): Record<string, any> =>
            Object.entries(obj).reduce((acc, [key, value]) => {
                const newKey = prefix ? `${prefix} ${key}` : key
                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                    Object.assign(acc, flattenObject(value, newKey))
                } else {
                    acc[newKey] = value
                }
                return acc
            }, {} as Record<string, any>)

        const flattened = rpData.map((row) => flattenObject(row))
        const allKeys = Array.from(new Set(flattened.flatMap((r) => Object.keys(r))))

        const columns = allKeys.map((key) => ({
            field: key,
            headerName: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            flex: 1,
            minWidth: 100,
            sortable: true,
            filter: true,
            cellRenderer: (params: any) => {
                const v = params.value
                if (typeof v === "boolean")
                    return (
                        <div className="flex items-center justify-center h-full">
                            {v ? (
                                <SquareCheckBig className="h-5 w-5 text-green-600"/>
                            ) : (
                                <SquareX className="h-5 w-5 text-red-600"/>
                            )}
                        </div>
                    )
                return <span className="text-gray-900">{String(v ?? "")}</span>
            },
        }))

        setColDefs(columns)
        setRowData(flattened)
    }, [rpData])

    if (!rpData || rpData.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                No RP data available
            </div>
        )
    }

    return (
        <div className="h-full">
            <AgGridReact
                rowData={rowData}
                columnDefs={colDefs}
                animateRows
                pagination={false}
                suppressCellFocus
            />
        </div>
    )
}