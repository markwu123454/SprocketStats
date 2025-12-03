export default function handler(_req, res) {
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
    const VERCEL_GIT_REPO_SLUG = get("VERCEL_GIT_REPO_SLUG");
    const VERCEL_GIT_REPO_OWNER = get("VERCEL_GIT_REPO_OWNER");
    const VERCEL_GIT_REPO_ID = get("VERCEL_GIT_REPO_ID");
    const VERCEL_GIT_COMMIT_REF = get("VERCEL_GIT_COMMIT_REF");
    const VERCEL_GIT_COMMIT_SHA_FULL = get("VERCEL_GIT_COMMIT_SHA");
    const VERCEL_GIT_COMMIT_SHA_SHORT = VERCEL_GIT_COMMIT_SHA_FULL.slice(0, 7);
    const VERCEL_GIT_COMMIT_MESSAGE = get("VERCEL_GIT_COMMIT_MESSAGE");
    const VERCEL_GIT_COMMIT_AUTHOR_LOGIN = get("VERCEL_GIT_COMMIT_AUTHOR_LOGIN");
    const VERCEL_GIT_COMMIT_AUTHOR_NAME = get("VERCEL_GIT_COMMIT_AUTHOR_NAME");
    const VERCEL_GIT_COMMIT_AUTHOR_EMAIL = get("VERCEL_GIT_COMMIT_AUTHOR_EMAIL");
    const VERCEL_GIT_PREVIOUS_SHA = get("VERCEL_GIT_PREVIOUS_SHA");
    const VERCEL_GIT_PULL_REQUEST_ID = get("VERCEL_GIT_PULL_REQUEST_ID");
    const VERCEL_GIT_COMMITTER_LOGIN = get("VERCEL_GIT_COMMITTER_LOGIN");
    const VERCEL_GIT_COMMITTER_NAME = get("VERCEL_GIT_COMMITTER_NAME");

    // ---- PROJECT METADATA (derived, non-sensitive) ----
    const DEPLOYMENT_TYPE = VERCEL_TARGET_ENV === "production" && !VERCEL_TARGET_ENV.includes("preview")
        ? "Production"
        : "Preview";
    const BRANCH_TYPE = VERCEL_GIT_BRANCH === "main" || VERCEL_GIT_BRANCH === "master" ? "Default" : "Feature";
    const PROVIDER_LABEL = VERCEL_GIT_PROVIDER ? `Provider: ${VERCEL_GIT_PROVIDER}` : "";

    // ---- DEPLOY HOOK (custom, non-sensitive if added manually) ----
    const BUILD_TIME = get("BUILD_TIME");
    const DEPLOY_TIME = get("DEPLOY_TIME");
    const COMMIT_AUTHOR_DATE = get("GIT_COMMIT_AUTHOR_DATE");
    const COMMIT_COMMITTER_DATE = get("GIT_COMMIT_COMMITTER_DATE");

    // ---- SYSTEM RUNTIME (non-sensitive) ----
    const VERCEL_RUNTIME = get("VERCEL_RUNTIME");
    const VERCEL_CONFIG_FILE = get("VERCEL_CONFIG_FILE");


    // ---- SENSITIVE METADATA (commented out but included per request) ----
    // const VERCEL_AUTOMATION_BYPASS_SECRET = get("VERCEL_AUTOMATION_BYPASS_SECRET"); // sensitive credential
    // const VERCEL_OIDC_TOKEN = get("VERCEL_OIDC_TOKEN"); // sensitive auth token
    // const VERCEL_OIDC_PUBLIC_KEY = get("VERCEL_OIDC_PUBLIC_KEY"); // sensitive when enabled
    // const VERCEL_OIDC_PRIVATE_KEY = get("VERCEL_OIDC_PRIVATE_KEY"); // sensitive key material
    // const VERCEL_API_TOKEN = get("VERCEL_API_TOKEN"); // sensitive token
    // const VERCEL_PASSWORD = get("VERCEL_PASSWORD"); // sensitive password
    // const VERCEL_ORG_ID = get("VERCEL_ORG_ID"); // sensitive org identifier if private plan
    // const VERCEL_BLOB_READ_WRITE_TOKEN = get("VERCEL_BLOB_READ_WRITE_TOKEN"); // sensitive storage token
    // const VERCEL_KV_REST_API_TOKEN = get("VERCEL_KV_REST_API_TOKEN"); // sensitive kv token
    // const VERCEL_KV_REST_API_READ_ONLY_TOKEN = get("VERCEL_KV_REST_API_READ_ONLY_TOKEN"); // sensitive read token
    // const VERCEL_GITLAB_TOKEN = get("VERCEL_GITLAB_TOKEN"); // sensitive gitlab token
    // const VERCEL_GITHUB_TOKEN = get("VERCEL_GITHUB_TOKEN"); // sensitive github token
    // const VERCEL_AWS_ACCESS_KEY_ID = get("VERCEL_AWS_ACCESS_KEY_ID"); // sensitive aws key
    // const VERCEL_AWS_SECRET_ACCESS_KEY = get("VERCEL_AWS_SECRET_ACCESS_KEY"); // sensitive aws secret key
    // const VERCEL_GCP_PROJECT_ID = get("VERCEL_GCP_PROJECT_ID"); // sensitive when tied to billing
    // const VERCEL_GCP_SERVICE_ACCOUNT_KEY = get("VERCEL_GCP_SERVICE_ACCOUNT_KEY"); // sensitive service key
    // const VERCEL_SLACK_WEBHOOK = get("VERCEL_SLACK_WEBHOOK"); // sensitive integration secret


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
