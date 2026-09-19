local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")
local Config = require(ServerScriptService:WaitForChild("Config"))

local serverId = game.JobId
local function request(method, path, body)
    local ok, result = pcall(function()
        local options={Url=Config.API_BASE_URL..path,Method=method,Headers={['Content-Type']='application/json',['X-Server-Secret']=Config.SERVER_SECRET}}
        if body then options.Body=HttpService:JSONEncode(body) end
        return HttpService:RequestAsync(options)
    end)
    if not ok or not result.Success then return nil end
    return result.Body ~= "" and HttpService:JSONDecode(result.Body) or {}
end

local function findPlayer(userId)
    return Players:GetPlayerByUserId(tonumber(userId) or -1)
end

local function applyStats(player, stats)
    local folder=player:FindFirstChild("leaderstats")
    if not folder then return false, "leaderstats folder not found" end
    for name,value in pairs(stats or {}) do
        local obj=folder:FindFirstChild(name)
        if obj and obj:IsA("ValueBase") then obj.Value=value end
    end
    return true
end

local function resetStats(player)
    local folder=player:FindFirstChild("leaderstats")
    if not folder then return false,"leaderstats folder not found" end
    for _,obj in ipairs(folder:GetChildren()) do
        if obj:IsA("IntValue") or obj:IsA("NumberValue") then obj.Value=0
        elseif obj:IsA("BoolValue") then obj.Value=false
        elseif obj:IsA("StringValue") then obj.Value=""
        end
    end
    return true
end

while true do
    task.wait(Config.COMMAND_POLL_SECONDS)
    local response=request("GET", "/api/roblox/commands?serverId="..HttpService:UrlEncode(serverId))
    for _,command in ipairs((response and response.commands) or {}) do
        local success=true
        local message="completed"
        local player=command.target_user_id and findPlayer(command.target_user_id)
        if command.command_type=="KICK" then
            if player then player:Kick((command.payload and command.payload.reason) or "Removed by an administrator") else success=false;message="Player is not in this server" end
        elseif command.command_type=="BAN" then
            if player then player:Kick("You are banned from this game.") end
        elseif command.command_type=="EDIT_STATS" then
            if player then success,message=applyStats(player,command.payload) else success=false;message="Player is not in this server; command remains a record for offline handling" end
        elseif command.command_type=="RESET_STATS" then
            if player then success,message=resetStats(player) else success=false;message="Player is not in this server; reset should be applied by the game's DataStore layer on next join" end
        end
        request("POST", "/api/roblox/commands/"..command.id.."/ack", {success=success,result={message=message}})
    end
end
