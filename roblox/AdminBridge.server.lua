local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")
local Config = require(ServerScriptService:WaitForChild("Config"))

local serverId = game.JobId ~= "" and game.JobId or HttpService:GenerateGUID(false)
local function request(method, path, body)
    local ok, result = pcall(function()
        local options = {Url = Config.API_BASE_URL .. path, Method = method, Headers = {
            ["Content-Type"] = "application/json",
            ["X-Server-Secret"] = Config.SERVER_SECRET,
        }}
        if body then options.Body = HttpService:JSONEncode(body) end
        return HttpService:RequestAsync(options)
    end)
    if not ok or not result.Success then
        warn("AdminBridge request failed:", result and result.StatusCode or result)
        return nil
    end
    return result.Body ~= "" and HttpService:JSONDecode(result.Body) or {}
end

local function statsFor(player)
    local folder = player:FindFirstChild("leaderstats")
    local stats = {}
    if folder then
        for _, value in ipairs(folder:GetChildren()) do
            if value:IsA("ValueBase") then stats[value.Name] = value.Value end
        end
    end
    return stats
end

local function join(player)
    request("POST", "/api/roblox/player-join", {
        userId = player.UserId,
        username = player.Name,
        displayName = player.DisplayName,
        serverId = serverId,
        state = "Playing",
        stats = statsFor(player),
    })
end

local function leave(player)
    request("POST", "/api/roblox/player-leave", {userId = player.UserId, serverId = serverId})
end

Players.PlayerAdded:Connect(join)
Players.PlayerRemoving:Connect(leave)
for _, player in ipairs(Players:GetPlayers()) do task.spawn(join, player) end

while true do
    task.wait(Config.HEARTBEAT_SECONDS)
    local list = Players:GetPlayers()
    request("POST", "/api/roblox/heartbeat", {
        serverId = serverId,
        jobId = game.JobId,
        playerCount = #list,
        maxPlayers = Players.MaxPlayers,
    })
    for _, player in ipairs(list) do
        request("POST", "/api/roblox/player-stats", {
            userId = player.UserId,
            username = player.Name,
            displayName = player.DisplayName,
            serverId = serverId,
            stats = statsFor(player),
        })
    end
end
