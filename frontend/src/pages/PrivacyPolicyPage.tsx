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
            <div className="theme-text space-y-4 text-sm leading-relaxed mx-auto max-w-3xl">
                <p className="opacity-80">
                    <strong>Last updated:</strong> Jan 20, 2026
                </p>

                <h2 className="text-base font-semibold">Overview</h2>
                <p>
                    This application (the “App”) is a Progressive Web Application (PWA) used for team operations related
                    to the FIRST Robotics Competition (FRC), including attendance verification and competition scouting.
                    We collect only the minimum data required for the App to function and do not use your data for
                    advertising or tracking outside the App.
                </p>

                <h2 className="text-base font-semibold">Account Information</h2>
                <p>
                    When you sign in using Google Login, we only collect your name and email
                    address. This information is stored and used only to identify you
                    and associate your activity within the App.
                </p>

                <h2 className="text-base font-semibold">FRC Scouting Data</h2>
                <p>
                    Scouting data collected through the App consists of competition-related observations, measurements,
                    and qualitative analysis of robots, matches, teams, and performance. This data is operational in
                    nature and is not intended to describe or profile individual users.
                </p>
                <p>
                    For record-keeping, attribution, and data integrity purposes, scouting submissions may be
                    temporarily associated with a user account identifier, such as an email address. This association is
                    used solely to identify the source of a submission and to prevent data misuse or duplication.
                </p>
                <p>
                    Upon account deletion or upon request, any direct personal identifiers associated with scouting
                    submissions (including email address and name, if present) can be removed or irreversibly
                    dissociated from the scouting records.
                </p>
                <p>
                    After this dissociation, the remaining scouting data is retained only in anonymized or aggregated
                    form and can no longer be linked to an identifiable individual. Anonymized scouting data is used for
                    team analysis, competition operations, and historical reference and is not subject to personal data
                    access or deletion requests.
                </p>
                <p>
                    Scouting data does not include sensitive personal information about students or participants.
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

                <h2 className="text-base font-semibold">Data Retention and Deletion</h2>
                <p>
                    Account information is retained for as long as the account remains
                    active or as necessary to support App functionality.
                </p>
                <p>
                    Users may request deletion of their account and associated personal
                    information by contacting us via the email address listed in the
                    Contact section. We do not currently provide an automated in-app
                    method for account or data deletion.
                </p>
                <p>
                    Scouting data may be retained in anonymized or aggregated form after
                    account deletion for competition analysis and historical records.
                </p>

                <h2 className="text-base font-semibold">Children’s Privacy</h2>
                <p>
                    This App is intended for use by FIRST Robotics Competition participants
                    and mentors and is operated in compliance with FIRST Youth Protection
                    Program requirements.
                </p>
                <p>
                    We do not knowingly collect personal information from children under
                    the age of 13 without appropriate consent. If we become aware that such
                    information has been collected, we will take steps to delete it.
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

                <h2 className="text-base font-semibold">Data Controller</h2>
                <p>
                    This App is operated by the developer and acts as the data controller for all
                    personal data collected and processed through the App.
                </p>

                <h2 className="text-base font-semibold">Legal Basis for Processing</h2>
                <p>
                    We process personal data only as necessary to provide App functionality, based
                    on user consent, fulfillment of operational requirements, and legitimate
                    interests related to team coordination and competition analysis.
                </p>

                <h2 className="text-base font-semibold">User Rights</h2>
                <p>
                    Users may request access to their personal data, correction of inaccurate
                    information, or deletion of their account and associated personal data by
                    contacting us. Requests are handled within a reasonable timeframe.
                </p>

                <h2 className="text-base font-semibold">Third-Party Authentication</h2>
                <p>
                    Authentication is handled through Google Login. We do not receive or store your
                    Google password. Google’s handling of authentication data is governed by its
                    own privacy policies.
                </p>

                <h2 className="text-base font-semibold">Data Storage and Hosting</h2>
                <p>
                    Data is stored on secure servers operated by reputable cloud service providers.
                    Data may be processed or stored in the United States or other jurisdictions
                    where such providers operate.
                </p>

                <h2 className="text-base font-semibold">Data Breach Response</h2>
                <p>
                    In the event of a data breach affecting personal information, we will take
                    reasonable steps to mitigate the impact and notify affected users where
                    required by applicable law.
                </p>

                <h2 className="text-base font-semibold">Third-Party Services</h2>
                <p>
                    This App relies on third-party services for core functionality, such as user
                    authentication. These services may process data in accordance with their own
                    privacy policies. We encourage users to review them:
                </p>
                <ul className="list-disc ml-6">
                    <li>
                        Google – <a href="https://policies.google.com/privacy" target="_blank" rel="ml-1 noreferrer"
                                    className="hover:underline">
                        Privacy Policy
                    </a>
                    </li>
                    <li>
                        Neon –
                        <a
                            href="https://neon.com/privacy-policy"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 hover:underline"
                        >
                            Privacy Policy
                        </a>
                    </li>
                    <li>
                        Render –
                        <a
                            href="https://render.com/privacy"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 hover:underline"
                        >
                            Privacy Policy
                        </a>
                    </li>
                    <li>
                        Vercel –
                        <a
                            href="https://vercel.com/legal/privacy-policy"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 hover:underline"
                        >
                            Privacy Policy
                        </a>
                    </li>
                    <li>
                        cron-job.org –
                        <a
                            href="https://cron-job.org/en/privacy/"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 hover:underline"
                        >
                            Privacy Policy
                        </a>
                    </li>
                    <li>
                        Cloudflare –
                        <a
                            href="https://www.cloudflare.com/privacypolicy/"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 hover:underline"
                        >
                            Privacy Policy
                        </a>
                    </li>
                </ul>

                <h2 className="text-base font-semibold">Changes</h2>
                <p>
                    This Privacy Policy may be updated from time to time. Changes will
                    be reflected by the “Last updated” date.
                </p>

                <h2 className="text-base font-semibold">Contact</h2>
                <p>
                    If you have questions or concerns about this Privacy Policy, including
                    data access or deletion requests, please contact us at:
                    <strong> me@markwu.org</strong>
                </p>
            </div>
        }
    />
}
