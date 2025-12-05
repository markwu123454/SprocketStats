export default async function handler(_req, res) {
    const get = (key) => process.env[key] ?? "";

    // ---- RUNTIME BUILD & PLATFORM METADATA (non-sensitive) ----
    const NODE_ENV = get("NODE_ENV");
    const VERCEL_ENV = get("VERCEL_ENV");
    const VERCEL_REGION = get("VERCEL_REGION");
    const VERCEL_URL = get("VERCEL_URL");
    const VERCEL_BRANCH_URL = get("VERCEL_BRANCH_URL");
    const VERCEL_PROJECT_PRODUCTION_URL = get("VERCEL_PROJECT_PRODUCTION_URL");
    const VERCEL_PROJECT_ID = get("VERCEL_PROJECT_ID");
    const VERCEL_DEPLOYMENT_ID = get("VERCEL_DEPLOYMENT_ID");
    const VERCEL_TARGET_ENV = get("VERCEL_TARGET_ENV");
    const CI = get("CI");
    const VERCEL = get("VERCEL");
    const VERCEL_REGION_CACHE = get("VERCEL_REGION_CACHE");
    const VERCEL_LOCAL = get("VERCEL_LOCAL");
    const VERCEL_AUTOMATION_ID = get("VERCEL_AUTOMATION_ID");
    const VERCEL_ANALYTICS_ID = get("VERCEL_ANALYTICS_ID");
    const VERCEL_EDGE_FUNCTION_REGION = get("VERCEL_EDGE_FUNCTION_REGION");
    const VERCEL_FUNCTION_REGION = get("VERCEL_FUNCTION_REGION");
    const VERCEL_TEAM_ID = get("VERCEL_TEAM_ID");
    const VERCEL_SCOPE = get("VERCEL_SCOPE");
    const VERCEL_GITHUB_DEPLOYMENT = get("VERCEL_GITHUB_DEPLOYMENT");
    const VERCEL_GITHUB_COMMIT_ORIGIN = get("VERCEL_GITHUB_COMMIT_ORIGIN");
    const VERCEL_IS_PREVIEW = VERCEL_ENV === "preview";

    // ---- GIT METADATA (non-sensitive) ----
    const VERCEL_GIT_PROVIDER = get("VERCEL_GIT_PROVIDER");
    const VERCEL_GIT_BRANCH = get("VERCEL_GIT_BRANCH");
    const VERCEL_GIT_REPO_SLUG = get("VERCEL_GIT_REPO_SLUG");   // repo name
    const VERCEL_GIT_REPO_OWNER = get("VERCEL_GIT_REPO_OWNER"); // org/user
    const VERCEL_GIT_REPO_ID = get("VERCEL_GIT_REPO_ID");
    const VERCEL_GIT_COMMIT_REF = get("VERCEL_GIT_COMMIT_REF");
    const VERCEL_GIT_COMMIT_SHA_FULL = get("VERCEL_GIT_COMMIT_SHA") || get("VERCEL_GIT_COMMIT_SHA_FULL");
    const VERCEL_GIT_COMMIT_SHA_SHORT = VERCEL_GIT_COMMIT_SHA_FULL
        ? VERCEL_GIT_COMMIT_SHA_FULL.slice(0, 7)
        : "";
    const VERCEL_GIT_COMMIT_MESSAGE = get("VERCEL_GIT_COMMIT_MESSAGE");
    const VERCEL_GIT_COMMIT_AUTHOR_LOGIN = get("VERCEL_GIT_COMMIT_AUTHOR_LOGIN");
    const VERCEL_GIT_COMMIT_AUTHOR_NAME = get("VERCEL_GIT_COMMIT_AUTHOR_NAME");
    const VERCEL_GIT_COMMIT_AUTHOR_EMAIL = get("VERCEL_GIT_COMMIT_AUTHOR_EMAIL");
    const VERCEL_GIT_PREVIOUS_SHA = get("VERCEL_GIT_PREVIOUS_SHA");
    const VERCEL_GIT_PULL_REQUEST_ID = get("VERCEL_GIT_PULL_REQUEST_ID");
    const VERCEL_GIT_COMMITTER_LOGIN = get("VERCEL_GIT_COMMITTER_LOGIN");
    const VERCEL_GIT_COMMITTER_NAME = get("VERCEL_GIT_COMMITTER_NAME");

    // ---- PROJECT METADATA (derived, non-sensitive) ----
    const DEPLOYMENT_TYPE =
        VERCEL_TARGET_ENV === "production" && !VERCEL_TARGET_ENV.includes("preview")
            ? "Production"
            : "Preview";
    const BRANCH_TYPE =
        VERCEL_GIT_BRANCH === "main" || VERCEL_GIT_BRANCH === "master" ? "Default" : "Feature";
    const PROVIDER_LABEL = VERCEL_GIT_PROVIDER ? `Provider: ${VERCEL_GIT_PROVIDER}` : "";

    // ---- DEPLOY HOOK (custom, non-sensitive if added manually) ----
    let BUILD_TIME = get("BUILD_TIME");
    let DEPLOY_TIME = get("DEPLOY_TIME");
    let COMMIT_AUTHOR_DATE = get("GIT_COMMIT_AUTHOR_DATE");
    let COMMIT_COMMITTER_DATE = get("GIT_COMMIT_COMMITTER_DATE");

    // ---- SYSTEM RUNTIME (non-sensitive) ----
    const VERCEL_RUNTIME = get("VERCEL_RUNTIME");
    const VERCEL_CONFIG_FILE = get("VERCEL_CONFIG_FILE");

    // ---- Fill missing commit dates from GitHub (runtime) ----
    // Only attempt if we have owner, repo, and sha
    if ((!COMMIT_AUTHOR_DATE || !COMMIT_COMMITTER_DATE) &&
        VERCEL_GIT_REPO_OWNER &&
        VERCEL_GIT_REPO_SLUG &&
        VERCEL_GIT_COMMIT_SHA_FULL
    ) {
        try {
            const githubToken = process.env.GITHUB_TOKEN;

            const resp = await fetch(
                `https://api.github.com/repos/${encodeURIComponent(
                    VERCEL_GIT_REPO_OWNER
                )}/${encodeURIComponent(VERCEL_GIT_REPO_SLUG)}/commits/${encodeURIComponent(
                    VERCEL_GIT_COMMIT_SHA_FULL
                )}`,
                {
                    headers: {
                        Accept: "application/vnd.github+json",
                        ...(githubToken
                            ? { Authorization: `Bearer ${githubToken}` }
                            : {}),
                        "User-Agent": "sprocketstats-deploy-metadata",
                    },
                }
            );

            if (resp.ok) {
                const commitJson = await resp.json();

                const authorDate = commitJson?.commit?.author?.date;
                const committerDate = commitJson?.commit?.committer?.date;

                if (!COMMIT_AUTHOR_DATE && authorDate) {
                    COMMIT_AUTHOR_DATE = authorDate;
                }
                if (!COMMIT_COMMITTER_DATE && committerDate) {
                    COMMIT_COMMITTER_DATE = committerDate;
                }

                // Optional: if BUILD_TIME / DEPLOY_TIME are not set, you could reuse committer date
                if (!BUILD_TIME && committerDate) {
                    BUILD_TIME = committerDate;
                }
                if (!DEPLOY_TIME && committerDate) {
                    DEPLOY_TIME = committerDate;
                }
            } else {
                // optional: log or swallow for robustness
                console.warn(
                    "GitHub commit fetch failed",
                    resp.status,
                    await resp.text()
                );
            }
        } catch (err) {
            console.warn("Error fetching commit from GitHub", err);
        }
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).send({
        NODE_ENV,
        VERCEL,
        VERCEL_ENV,
        VERCEL_TARGET_ENV,
        CI,
        VERCEL_REGION,
        VERCEL_URL,
        VERCEL_BRANCH_URL,
        VERCEL_PROJECT_PRODUCTION_URL,
        VERCEL_PROJECT_ID,
        VERCEL_DEPLOYMENT_ID,
        VERCEL_TEAM_ID,
        VERCEL_SCOPE,
        VERCEL_REGION_CACHE,
        VERCEL_LOCAL,
        VERCEL_AUTOMATION_ID,
        VERCEL_ANALYTICS_ID,
        VERCEL_GITHUB_DEPLOYMENT,
        VERCEL_GITHUB_COMMIT_ORIGIN,
        VERCEL_IS_PREVIEW,
        DEPLOYMENT_TYPE,
        BRANCH_TYPE,
        PROVIDER_LABEL,

        VERCEL_GIT_PROVIDER,
        VERCEL_GIT_BRANCH,
        VERCEL_GIT_REPO_SLUG,
        VERCEL_GIT_REPO_OWNER,
        VERCEL_GIT_REPO_ID,
        VERCEL_GIT_COMMIT_REF,
        VERCEL_GIT_COMMIT_SHA_FULL,
        VERCEL_GIT_COMMIT_SHA_SHORT,
        VERCEL_GIT_COMMIT_MESSAGE,
        VERCEL_GIT_COMMIT_AUTHOR_LOGIN,
        VERCEL_GIT_COMMIT_AUTHOR_NAME,
        VERCEL_GIT_COMMIT_AUTHOR_EMAIL,
        VERCEL_GIT_PULL_REQUEST_ID,
        VERCEL_GIT_PREVIOUS_SHA,
        VERCEL_GIT_COMMITTER_LOGIN,
        VERCEL_GIT_COMMITTER_NAME,

        BUILD_TIME,
        DEPLOY_TIME,
        COMMIT_AUTHOR_DATE,
        COMMIT_COMMITTER_DATE,

        VERCEL_RUNTIME,
        VERCEL_CONFIG_FILE,
        VERCEL_EDGE_FUNCTION_REGION,
        VERCEL_FUNCTION_REGION,
    });
}
