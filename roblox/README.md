# Roblox setup

1. Enable **HTTP Requests** for the experience.
2. Put `Config.lua` in `ServerScriptService` and replace the URL/secret.
3. Put the three `.server.lua` scripts in `ServerScriptService`.
4. Keep all of these server-only. Do not copy the secret into ReplicatedStorage or LocalScripts.
5. Connect your real DataStore/leaderstats system to the `applyStats` and `resetStats` functions. The starter can update simple ValueBase leaderstats immediately, but your game's actual saved-stat system should also persist those changes.

The Worker command queue is intentionally server-polled. The website creates a command; the Roblox server claims it, executes it, and acknowledges it.
