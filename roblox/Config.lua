-- Server-only configuration. Keep this ModuleScript under ServerScriptService.
return {
    API_BASE_URL = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev",
    SERVER_SECRET = "REPLACE_WITH_LONG_RANDOM_SERVER_SECRET",
    HEARTBEAT_SECONDS = 5,
    COMMAND_POLL_SECONDS = 2,
    STATS_PUSH_SECONDS = 15,
}
