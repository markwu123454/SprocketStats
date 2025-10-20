import {Link} from "react-router-dom";

export default function AdminHomeLayout() {
    return (
        <div className="bg-white p-6 space-y-6">
            <h1 className="text-2xl font-extrabold text-gray-800">Admin Home</h1>
            <div className="max-w-[200px] flex flex-col gap-4">
                <FancyButton to="/admin/monitor" label="Go to Scouting"/>
                <FancyButton to="/admin/data" label="Go to Data"/>
            </div>
        </div>
    );
}

function FancyButton({to, label}: { to: string; label: string }) {
    return (
        <Link
            to={to}
            className="relative group inline-flex items-center justify-center text-white font-bold text-lg md:text-xl rounded-lg p-[3px] cursor-pointer shadow-sm overflow-hidden"
        >
            {/* Blurred background layer */}
            <span className="absolute inset-0 bg-rainbow rounded-lg transition duration-300 group-hover:blur-md z-10"/>

            {/* Foreground content */}
            <span
                className="relative z-10 bg-zinc-900 rounded-md px-6 py-3 transition-colors duration-300 group-hover:bg-transparent w-full h-full text-center">
        {label}
    </span>
        </Link>

    );
}
