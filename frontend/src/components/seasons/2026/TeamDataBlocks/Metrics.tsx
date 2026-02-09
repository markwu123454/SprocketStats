export default function MetricsBlock({data}: any) {
    const metrics = data.metrics ?? {}

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm p-4">
            {Object.entries(metrics).map(([key, val]) => {
                const valueStr = String(val).toLowerCase()
                const colorClass =
                    valueStr === "yes"
                        ? "text-green-600"
                        : valueStr === "no"
                            ? "text-red-600"
                            : "text-gray-900"

                return (
                    <div key={key} className="flex justify-between border-b border-gray-100 py-1">
                        <span className="text-gray-500">{key}</span>
                        <span className={`font-medium ${colorClass}`}>{String(val)}</span>
                    </div>
                )
            })}
        </div>
    )
}