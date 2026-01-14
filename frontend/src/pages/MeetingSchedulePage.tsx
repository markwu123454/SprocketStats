import {ArrowLeft, Plus, Trash} from "lucide-react"
import {useEffect, useMemo, useState} from "react"
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper"
import {useAPI} from "@/hooks/useAPI"
import {Link} from "react-router-dom"
import {DateTime} from "luxon"

type TimeBlock = {
    id: string
    start: string
    end: string
}

const LA_TZ = "America/Los_Angeles"

function laLocalToUTCISO(local: string) {
    return DateTime
        .fromISO(local, {zone: "America/Los_Angeles"})
        .toUTC()
        .toISO()
}

export default function MeetingSchedulePage() {
    const {getMeetingSchedule, addMeetingTimeBlock, deleteMeetingTimeBlock} = useAPI()

    const [blocks, setBlocks] = useState<TimeBlock[]>([])
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)

    useEffect(() => {
        getMeetingSchedule().then(events => {
            setBlocks(toBlocks(events))
        })
    }, [])

    const sorted = useMemo(
        () =>
            [...blocks].sort(
                (a, b) =>
                    Date.parse(a.start) - Date.parse(b.start)
            ),
        [blocks]
    )

    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center gap-4 text-xl theme-text w-full">
                    <Link
                        to="/admin"
                        className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover"
                    >
                        <ArrowLeft className="h-5 w-5"/>
                    </Link>
                    <span>Meeting Schedule</span>
                </div>
            }
            body={
                <div className="w-full h-full flex flex-col gap-3">

                    {/* Action bar */}
                    <div className="flex flex-col gap-2 p-3 rounded-md shadow theme-bg theme-border">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowForm(true)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded theme-button-bg theme-text hover:theme-button-hover"
                            >
                                <Plus size={16}/>
                                Add time block
                            </button>
                        </div>
                    </div>

                    {/* Schedule list */}
                    <div className="flex-1 rounded-md shadow theme-bg theme-border overflow-auto">
                        <div className="divide-y theme-border">
                            {sorted.map(block => (
                                <BlockRow
                                    key={block.id}
                                    block={block}
                                    onDelete={async () => {
                                        await deleteMeetingTimeBlock({
                                            start: block.start,
                                            end: block.end,
                                        })
                                        setBlocks(b => b.filter(x => x.id !== block.id))
                                    }}
                                />
                            ))}

                            {sorted.length === 0 && (
                                <div className="p-6 text-sm text-gray-500">
                                    No time blocks defined
                                </div>
                            )}
                        </div>
                    </div>

                    {showForm && (
                        <AddBlockModal
                            onClose={() => setShowForm(false)}
                            onSave={async (start, end) => {
                                await addMeetingTimeBlock({start, end})
                                const events = await getMeetingSchedule()
                                setBlocks(toBlocks(events))
                            }}
                        />
                    )}
                </div>
            }
        />
    )
}

function BlockRow({
                      block,
                      onDelete,
                  }: {
    block: TimeBlock
    onDelete: () => void
}) {
    function formatTimeLA(iso: string) {
        return new Intl.DateTimeFormat("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: LA_TZ,
        }).format(new Date(iso))
    }

    function formatDateLA(iso: string) {
        return new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: LA_TZ,
        }).format(new Date(iso))
    }

    return (
        <div className="flex items-center justify-between p-3 hover:bg-black/5">
            <div className="flex flex-col">
        <span className="font-medium">
            {formatTimeLA(block.start)} – {formatTimeLA(block.end)}
        </span>
                <span className="text-xs text-gray-500">
                    {formatDateLA(block.start)}
                </span>
            </div>

            <button
                onClick={onDelete}
                className="p-2 rounded hover:bg-red-500/10 text-red-600"
            >
                <Trash size={16}/>
            </button>
        </div>
    )
}

function AddBlockModal({
                           onClose,
                           onSave,
                       }: {
    onClose: () => void
    onSave: (start: string, end: string) => Promise<void>
}) {
    const [start, setStart] = useState("")
    const [end, setEnd] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    async function submit() {
        setError(null)

        if (!start || !end) {
            setError("Both fields are required")
            return
        }

        const startISO = laLocalToUTCISO(start)
        const endISO = laLocalToUTCISO(end)

        if (new Date(endISO) <= new Date(startISO)) {
            setError("End must be after start")
            return
        }

        try {
            setSaving(true)
            await onSave(startISO, endISO)
            onClose() // close only on success
        } catch (err) {
            console.error(err)
            setError("Failed to save time block. Please adjust and try again.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="w-96 p-4 rounded shadow theme-bg theme-border flex flex-col gap-3">
                <div className="text-lg font-semibold theme-text">Add time block</div>

                <div className="text-sm theme-text">Starting time:</div>
                <input
                    type="datetime-local"
                    className="theme-bg theme-border rounded px-2 py-1"
                    value={start}
                    onChange={e => setStart(e.target.value)}
                    disabled={saving}
                />

                <div className="text-sm theme-text">Ending time:</div>
                <input
                    type="datetime-local"
                    className="theme-bg theme-border rounded px-2 py-1"
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                    disabled={saving}
                />

                {error && <div className="text-sm text-red-600">{error}</div>}

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1 theme-text" disabled={saving}>
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="px-3 py-1 rounded theme-button-bg theme-text hover:theme-button-hover disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    )
}

type AttendanceEvent = {
    action: "checkin" | "checkout"
    time: string
}

function toBlocks(events: AttendanceEvent[]): TimeBlock[] {
    const sorted = [...events].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    )

    const blocks: TimeBlock[] = []

    let open: AttendanceEvent | null = null

    for (const e of sorted) {
        if (e.action === "checkin") {
            open = e
        }

        if (e.action === "checkout" && open) {
            blocks.push({
                id: `${open.time}-${e.time}`,
                start: open.time,
                end: e.time,
            })
            open = null
        }
    }

    return blocks
}
