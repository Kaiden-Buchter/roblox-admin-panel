local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local DATASTORE_NAME = "PlayerLeaderstats_v1"
local AUTOSAVE_SECONDS = 60
local MAX_RETRIES = 3

local STAT_DEFAULTS = {
    Coins = 0,
    Wins = 0,
    Level = 1,
}

local store = DataStoreService:GetDataStore(DATASTORE_NAME)
local saving = {}

local function retry(callback)
    local lastError

    for attempt = 1, MAX_RETRIES do
        local ok, result = pcall(callback)
        if ok then
            return true, result
        end

        lastError = result
        task.wait(attempt * 2)
    end

    return false, lastError
end

local function createLeaderstats(player)
    local folder = Instance.new("Folder")
    folder.Name = "leaderstats"
    folder.Parent = player

    for name, defaultValue in pairs(STAT_DEFAULTS) do
        local value = Instance.new("IntValue")
        value.Name = name
        value.Value = defaultValue
        value.Parent = folder
    end

    return folder
end

local function loadStats(player, folder)
    local ok, data = retry(function()
        return store:GetAsync(tostring(player.UserId))
    end)

    if not ok then
        warn("Could not load leaderstats for " .. player.Name .. ": " .. tostring(data))
        return
    end

    if type(data) ~= "table" then
        return
    end

    for name, defaultValue in pairs(STAT_DEFAULTS) do
        local savedValue = data[name]
        local stat = folder:FindFirstChild(name)

        if stat and typeof(savedValue) == "number" then
            stat.Value = math.max(0, math.floor(savedValue))
        elseif stat then
            stat.Value = defaultValue
        end
    end
end

local function readStats(player)
    local folder = player:FindFirstChild("leaderstats")
    local data = {}

    if not folder then
        return data
    end

    for name in pairs(STAT_DEFAULTS) do
        local stat = folder:FindFirstChild(name)
        if stat and stat:IsA("IntValue") then
            data[name] = stat.Value
        end
    end

    return data
end

local function saveStats(player)
    if saving[player] then
        return false
    end

    saving[player] = true
    local data = readStats(player)
    local ok, errorMessage = retry(function()
        return store:SetAsync(tostring(player.UserId), data)
    end)
    saving[player] = nil

    if not ok then
        warn("Could not save leaderstats for " .. player.Name .. ": " .. tostring(errorMessage))
    end

    return ok
end

local function onPlayerAdded(player)
    local folder = createLeaderstats(player)
    loadStats(player, folder)
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(function(player)
    saveStats(player)
end)

for _, player in ipairs(Players:GetPlayers()) do
    task.spawn(onPlayerAdded, player)
end

task.spawn(function()
    while true do
        task.wait(AUTOSAVE_SECONDS)

        for _, player in ipairs(Players:GetPlayers()) do
            task.spawn(saveStats, player)
        end
    end
end)

game:BindToClose(function()
    local players = Players:GetPlayers()
    local remaining = #players

    if remaining == 0 then
        return
    end

    for _, player in ipairs(players) do
        task.spawn(function()
            saveStats(player)
            remaining -= 1
        end)
    end

    local deadline = os.clock() + 25
    while remaining > 0 and os.clock() < deadline do
        task.wait()
    end
end)
