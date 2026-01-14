import {ArrowLeft, Plus, Trash} from "lucide-react"
import {useEffect, useMemo, useState} from "react"
import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper"
import {useAPI} from "@/hooks/useAPI"
import {Link} from "react-router-dom"

type TimeBlock = {
    id: string
    start: string
    end: string
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
                (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
            ),
        [blocks]
    )

    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center gap-4 text-xl theme-text w-full">
                    <Link
                        to="/more"
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
                                        await deleteMeetingTimeBlock(block.id)
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
                                setLoading(true)
                                const created = await addMeetingTimeBlock({start, end})
                                setBlocks(b => [...b, created])
                                setLoading(false)
                                setShowForm(false)
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
    const start = new Date(block.start)
    const end = new Date(block.end)

    return (
        <div className="flex items-center justify-between p-3 hover:bg-black/5">
            <div className="flex flex-col">
        <span className="font-medium">
          {start.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})} –{" "}
            {end.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}
        </span>
                <span className="text-xs text-gray-500">
          {start.toLocaleDateString()}
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
    onSave: (start: string, end: string) => void
}) {
    const [start, setStart] = useState("")
    const [end, setEnd] = useState("")
    const [error, setError] = useState<string | null>(null)

    function submit() {
        if (!start || !end) return setError("Both fields required")
        if (new Date(end) <= new Date(start)) return setError("End must be after start")
        onSave(start, end)
    }

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="w-96 p-4 rounded shadow theme-bg theme-border flex flex-col gap-3">
                <div className="text-lg font-semibold theme-text">Add time block</div>

                <div className="text-sm theme-text">Starting time: </div>

                <input
                    type="datetime-local"
                    className="theme-bg theme-border rounded px-2 py-1"
                    value={start}
                    onChange={e => setStart(e.target.value)}
                />

                <div className="text-sm theme-text">Ending time: </div>

                <input
                    type="datetime-local"
                    className="theme-bg theme-border rounded px-2 py-1"
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                />

                {error && <div className="text-sm text-red-600">{error}</div>}

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1 theme-text">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        className="px-3 py-1 rounded theme-button-bg theme-text hover:theme-button-hover"
                    >
                        Save
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
