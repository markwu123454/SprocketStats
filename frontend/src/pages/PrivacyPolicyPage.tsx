import {HeaderFooterLayoutWrapper} from "@/components/wrappers/HeaderFooterLayoutWrapper.tsx";
import {Link} from "react-router-dom";
import {ArrowLeft} from "lucide-react";

export default function PrivacyPolicyPage() {
    return <HeaderFooterLayoutWrapper
        header={
            <div className="flex items-center gap-4 text-xl theme-text w-full">
                <Link
                    to="/more"
                    className="flex items-center p-2 rounded-md theme-button-bg hover:theme-button-hover"
                >
                    <ArrowLeft className="h-5 w-5"/>
                </Link>
                <span>Privacy Policy</span>
            </div>
        }
        body={
            <div className="theme-text space-y-4 text-sm leading-relaxed">
                <p className="opacity-80">
                    <strong>Last updated:</strong> Jan 19, 2026
                </p>

                <h2 className="text-base font-semibold">Overview</h2>
                <p>
                    This application (the “App”) is a Progressive Web Application (PWA)
                    used for attendance verification and FIRST Robotics Competition (FRC)
                    scouting. We collect only the minimum data required for the App to
                    function and do not use your data for advertising or tracking outside
                    the App.
                </p>

                <h2 className="text-base font-semibold">Account Information</h2>
                <p>
                    When you sign in using Google Login, we collect your name and email
                    address. This information is stored and used only to identify you
                    and associate your activity within the App.
                </p>

                <h2 className="text-base font-semibold">FRC Scouting Data</h2>
                <p>
                    The App includes dedicated pages for match scouting and pit scouting.
                    These features allow users to submit detailed competition-related data,
                    including quantitative and qualitative observations about robots,
                    matches, teams, and performance.
                </p>
                <p>
                    Scouting data may be extensive in volume and is stored and processed on
                    our servers for team analysis and competition operations. All scouting
                    submissions are associated with the submitting user’s account email for
                    identification and data integrity purposes.
                </p>
                <p>
                    Scouting data does not include sensitive personal information and is not
                    used for advertising, profiling, or purposes unrelated to FRC
                    competitions.
                </p>

                <h2 className="text-base font-semibold">Scouting Data Sharing</h2>
                <p>
                    Processed or aggregated scouting data may be shared in part or in full
                    with other FRC teams for competition analysis and collaboration purposes.
                </p>
                <p>
                    Any scouting data shared outside the App does not include user account
                    information, such as names, email addresses, or other direct identifiers.
                </p>
                <p>
                    Raw account information is never shared with other teams.
                </p>

                <h2 className="text-base font-semibold">Camera Access</h2>
                <p>
                    The App may request access to your device’s camera only when you
                    explicitly initiate a check-in or check-out action. Camera access
                    is used exclusively to scan a physical QR code to verify your
                    presence at a location. Camera images or video are not stored.
                </p>

                <h2 className="text-base font-semibold">Location Data</h2>
                <p>
                    Location access is requested only when you initiate a check-in or
                    check-out. Location data is used one time to verify attendance and
                    is not retained after verification is complete.
                </p>

                <h2 className="text-base font-semibold">Push Notifications</h2>
                <p>
                    We store the minimum information required to send push notifications,
                    such as a device or notification token. This data is used only to
                    deliver App-related notifications.
                </p>

                <h2 className="text-base font-semibold">Data Sharing</h2>
                <p>
                    We do not sell or share your personal data with third parties except
                    where required for core functionality (such as authentication) or
                    when required by law.
                </p>

                <h2 className="text-base font-semibold">User Control</h2>
                <p>
                    You can control camera, location, and notification permissions
                    through your device settings. Disabling certain permissions may
                    limit App functionality.
                </p>

                <h2 className="text-base font-semibold">Data Security</h2>
                <p>
                    We apply reasonable technical and organizational measures to protect
                    stored data. However, no system can be guaranteed to be completely
                    secure.
                </p>

                <h2 className="text-base font-semibold">Changes</h2>
                <p>
                    This Privacy Policy may be updated from time to time. Changes will
                    be reflected by the “Last updated” date.
                </p>

                <h2 className="text-base font-semibold">Contact</h2>
                <p>
                    If you have questions or concerns about this Privacy Policy, please
                    contact us at: <strong>me@markwu.org</strong>
                </p>
            </div>
        }
    />
}
