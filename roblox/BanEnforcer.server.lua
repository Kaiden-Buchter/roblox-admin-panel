local Players=game:GetService("Players")
local HttpService=game:GetService("HttpService")
local ServerScriptService=game:GetService("ServerScriptService")
local Config=require(ServerScriptService:WaitForChild("Config"))
local function check(player)
    local ok,res=pcall(function()
        return HttpService:RequestAsync({Url=Config.API_BASE_URL.."/api/roblox/ban-check/"..player.UserId,Method="GET",Headers={['X-Server-Secret']=Config.SERVER_SECRET}})
    end)
    if not ok or not res.Success then return end
    local data=HttpService:JSONDecode(res.Body)
    if data.banned then player:Kick("You are banned from this game.") end
end
Players.PlayerAdded:Connect(check)
for _,p in ipairs(Players:GetPlayers()) do task.spawn(check,p) end
