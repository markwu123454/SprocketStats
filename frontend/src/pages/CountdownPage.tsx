import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper.tsx";
import {ArrowLeft} from "lucide-react";
import {useEffect, useState} from "react";
import {Link} from "react-router-dom";

type CountdownTarget = {
    name: string;
    date: Date;
};

function getTimeRemaining(target: Date) {
    const total = target.getTime() - Date.now();

    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return {total, days, hours, minutes, seconds};
}

export default function CountdownPage() {
    const countdowns: CountdownTarget[] = [
        {
            name: "REBUILT™ Kickoff",
            // Jan 10, 2026 – 9:00 AM PST
            date: new Date("2026-01-10T09:00:00-08:00"),
        },
        {
            name: "2026 Port Hueneme Event",
            // Friday before event: Mar 6, 2026 – 8:30 PM PST
            date: new Date("2026-03-06T20:30:00-08:00"),
        },
        {
            name: "2026 San Gabriel Valley Event",
            // Friday before event: Mar 27, 2026 – 8:30 PM PDT
            date: new Date("2026-03-27T20:30:00-07:00"),
        },
    ];

    const [times, setTimes] = useState(
        countdowns.map(c => getTimeRemaining(c.date))
    );

    useEffect(() => {
        const interval = setInterval(() => {
            setTimes(countdowns.map(c => getTimeRemaining(c.date)));
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <HeaderFooterLayoutWrapper
            header={
                <div className="flex items-center gap-4 text-xl theme-text">
                    <Link
                        to="/more"
                        className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5"/>
                    </Link>
                    <span>FRC 2026 Sprocket Countdown</span>
                </div>
            }
            body={
                <div className="flex flex-col items-center justify-center h-full gap-12 theme-text">
                    {countdowns.map((c, i) => {
                        const time = times[i];

                        return (
                            <div
                                key={c.name}
                                className="flex flex-col items-center gap-4"
                            >
                                <h2 className="text-2xl font-semibold">
                                    {c.name}
                                </h2>

                                {time.total > 0 ? (
                                    <div className="grid grid-cols-4 gap-6 text-center">
                                        <CountdownBlock label="Days" value={time.days}/>
                                        <CountdownBlock label="Hours" value={time.hours}/>
                                        <CountdownBlock label="Minutes" value={time.minutes}/>
                                        <CountdownBlock label="Seconds" value={time.seconds}/>
                                    </div>
                                ) : (
                                    <div className="text-2xl font-bold">
                                        Why are you here GET TO WORK!!!
                                    </div>
                                )}

                                <div className="text-sm opacity-70">
                                    {c.date.toLocaleString("en-US", {
                                        weekday: "long",
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                        timeZoneName: "short",
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            }
        />
    );
}

function CountdownBlock({label, value}: { label: string; value: number }) {
    return (
        <div className="flex flex-col items-center">
            <div className="text-5xl font-mono font-bold">
                {String(value).padStart(2, "0")}
            </div>
            <div className="text-sm opacity-70 mt-1">
                {label}
            </div>
        </div>
    );
}
