const app = document.querySelector('#app');
const title = document.querySelector('#title');
const modalRoot = document.querySelector('#modal-root');
let currentUser = null;
let currentView = 'dashboard';
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fmt = timestamp => timestamp ? new Date(timestamp).toLocaleString() : '—';

function card(label, value, tone = '') {
    return `<div class="stat ${tone}"><span>${label}</span><strong>${value ?? 0}</strong><i></i></div>`;
}

function emptyRow(columns, message) {
    return `<tr><td colspan="${columns}" class="empty-state">${message}</td></tr>`;
}

function showLoading(message = 'Loading workspace...') {
    app.innerHTML = `<div class="page-loading"><span class="loading-orb"></span><div><b>${esc(message)}</b><small>Please wait a moment.</small></div></div>`;
}

function showConnectionError(error) {
    app.innerHTML = `<div class="panel connection-error"><span class="error-mark">!</span><div><h2>We could not load this view</h2><p>${esc(error.message || 'The API is unavailable right now.')}</p><button onclick="location.reload()">Try again</button></div></div>`;
}

function setProfile(user) {
    currentUser = user;
    const name = user?.displayName || user?.username || 'Account';
    const initial = name.slice(0, 1).toUpperCase();
    document.querySelector('#profile-name').textContent = name;
    document.querySelector('#profile-avatar').textContent = initial;
    document.querySelector('#profile-menu-name').textContent = name;
    document.querySelector('#profile-menu-role').textContent = user?.role || 'Admin';
    document.querySelector('#profile-menu-avatar').textContent = initial;
}

    function setExperienceName(name) {
        const label = document.querySelector('#experience-name');
        if (label && name) label.textContent = name.toUpperCase();
    }

async function dashboard() {
    title.textContent = 'Dashboard';
    const data = await api('/api/dashboard');
        setExperienceName(data.gameName);
    app.innerHTML = `<div class="stats">${card('Active Players', data.activePlayers, 'stat-live')}${card('Saved Players', data.players)}${card('Live Servers', data.servers, 'stat-live')}${card('Active Bans', data.bans, 'stat-alert')}</div><div class="grid2 dashboard-grid"><div class="panel"><div class="panel-head"><div><h2>Recent audit activity</h2><small>Administrative actions across the game</small></div><button class="subtle-button" onclick="audit()">View all</button></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Result</th></tr></thead><tbody>${data.recentAudit.map(item => `<tr><td>${fmt(item.timestamp)}</td><td>${esc(item.admin_username || 'System')}</td><td><b>${esc(item.action)}</b></td><td>${esc(item.target_username || item.target_user_id || '—')}</td><td><span class="pill ${item.success ? 'ok' : 'bad'}">${item.success ? 'Success' : 'Failed'}</span></td></tr>`).join('') || emptyRow(5, 'No audit activity yet.')}</tbody></table></div></div><div class="panel pulse-panel"><div class="panel-head"><div><h2>System pulse</h2><small>Current service snapshot</small></div><span class="status-mark">Healthy</span></div><div class="pulse-list"><div><span>Player presence</span><b>${data.activePlayers || 0} online</b></div><div><span>Server fleet</span><b>${data.servers || 0} live</b></div><div><span>Enforcement</span><b>${data.bans || 0} active bans</b></div></div><button class="wide-button" onclick="servers()">Inspect live servers</button></div></div>`;
}

async function active() {
    title.textContent = 'Active Players';
    const rows = await api('/api/active');
    app.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Live player sessions</h2><small>Players currently connected to Roblox servers</small></div><button onclick="active()">Refresh</button></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>User ID</th><th>Server</th><th>State</th><th>Last heartbeat</th><th>Actions</th></tr></thead><tbody>${rows.map(item => `<tr><td><b>${esc(item.username)}</b></td><td>${esc(item.user_id)}</td><td>${esc(item.server_id)}</td><td><span class="pill ok">${esc(item.state)}</span></td><td>${fmt(item.last_heartbeat_at)}</td><td><button onclick="kick('${esc(item.user_id)}','${esc(item.username)}','${esc(item.server_id)}')">Kick</button></td></tr>`).join('') || emptyRow(6, 'No active players right now.')}</tbody></table></div></div>`;
}

async function players() {
    title.textContent = 'Players';
    app.innerHTML = `<div class="panel"><div class="toolbar"><div><h2>Player directory</h2><small>Search cached player records and manage stats</small></div><div class="search-group"><input id="search" placeholder="Username or Roblox ID"><button onclick="loadPlayers()">Search</button></div></div><div id="playerTable"></div></div>`;
    await loadPlayers();
}

async function loadPlayers() {
    const query = document.querySelector('#search')?.value || '';
    const rows = await api('/api/players?q=' + encodeURIComponent(query));
    document.querySelector('#playerTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Player</th><th>User ID</th><th>Last seen</th><th>Server</th><th>Stats</th><th></th></tr></thead><tbody>${rows.map(item => `<tr><td><b>${esc(item.username)}</b><small>${esc(item.display_name)}</small></td><td>${esc(item.user_id)}</td><td>${fmt(item.last_seen_at)}</td><td>${esc(item.last_server_id || 'Offline')}</td><td><pre>${esc(item.stats_json)}</pre></td><td><button onclick="player('${esc(item.user_id)}')">Manage</button></td></tr>`).join('') || emptyRow(6, 'No players found.')}</tbody></table></div>`;
}

async function player(userId) {
    const data = await api('/api/players/' + encodeURIComponent(userId));
    title.textContent = data.username;
    const statsArgument = JSON.stringify(data.stats).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    app.innerHTML = `<div class="grid2"><div class="panel profile-panel"><div class="profile-heading"><div class="avatar">${esc(data.username?.slice(0, 1).toUpperCase())}</div><div><h2>${esc(data.username)}</h2><small>Roblox player profile</small></div></div><div class="detail-list"><div><span>Roblox ID</span><b>${esc(data.user_id)}</b></div><div><span>Last seen</span><b>${fmt(data.last_seen_at)}</b></div><div><span>Last server</span><b>${esc(data.last_server_id || 'Offline')}</b></div></div><div class="actions"><button onclick="kick('${esc(data.user_id)}','${esc(data.username)}','${esc(data.last_server_id || '')}')">Kick</button><button onclick="ban('${esc(data.user_id)}','${esc(data.username)}')">Ban</button><button class="danger-button" onclick="resetStats('${esc(data.user_id)}')">Reset Stats</button></div></div><div class="panel"><div class="panel-head"><div><h2>Saved stats</h2><small>Data cached from the Roblox server</small></div><button onclick="editStats('${esc(data.user_id)}',${statsArgument})">Edit JSON</button></div><pre class="bigpre">${esc(JSON.stringify(data.stats, null, 2))}</pre></div></div><div class="panel"><h2>Ban history</h2><pre>${esc(JSON.stringify(data.bans, null, 2))}</pre></div>`;
}

async function servers() {
    title.textContent = 'Servers';
    const rows = await api('/api/servers');
    app.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Live game servers</h2><small>Only occupied servers with a heartbeat within the last 10 minutes.</small></div><button onclick="servers()">Refresh</button></div><div class="table-wrap"><table><thead><tr><th>Server</th><th>Job</th><th>Players</th><th>Last heartbeat</th><th>Status</th></tr></thead><tbody>${rows.map(item => `<tr><td><b>${esc(item.server_id)}</b></td><td>${esc(item.job_id || '—')}</td><td><strong>${item.player_count}</strong> / ${item.max_players || '?'}</td><td>${fmt(item.last_heartbeat_at)}</td><td><span class="pill ok">Live</span></td></tr>`).join('') || emptyRow(5, 'No live servers right now.')}</tbody></table></div></div>`;
}

async function bans() {
    title.textContent = 'Bans';
    const rows = await api('/api/bans');
    app.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Enforcement records</h2><small>Review and reverse active player bans</small></div><button onclick="bans()">Refresh</button></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Reason</th><th>Created</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(item => `<tr><td>${esc(item.username || item.user_id)}<small>${esc(item.user_id)}</small></td><td>${esc(item.reason)}</td><td>${fmt(item.created_at)}</td><td>${item.expires_at ? fmt(item.expires_at) : 'Permanent'}</td><td><span class="pill ${item.revoked_at || (item.expires_at && item.expires_at < Date.now()) ? 'bad' : 'ok'}">${item.revoked_at ? 'Revoked' : item.expires_at && item.expires_at < Date.now() ? 'Expired' : 'Active'}</span></td><td>${!item.revoked_at ? `<button onclick="unban('${esc(item.user_id)}')">Unban</button>` : ''}</td></tr>`).join('') || emptyRow(6, 'No bans recorded.')}</tbody></table></div></div>`;
}

async function audit() {
    title.textContent = 'Audit Logs';
    app.innerHTML = `<div class="panel"><div class="toolbar"><div><h2>Audit trail</h2><small>Showing up to 500 records. Use the sort menu to organize actions.</small></div><div class="search-group"><input id="auditSearch" placeholder="Admin, action, username, ID"><button onclick="loadAudit()">Search</button><select id="auditSort" aria-label="Sort audit logs" onchange="loadAudit()"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="action-asc">Action A-Z</option><option value="action-desc">Action Z-A</option></select></div></div><div id="auditTable"></div></div>`;
    await loadAudit();
}

async function loadAudit() {
    const query = document.querySelector('#auditSearch')?.value || '';
    const sort = document.querySelector('#auditSort')?.value || 'newest';
    const rows = await api('/api/audit-logs?q=' + encodeURIComponent(query));
    rows.sort((left, right) => {
        if (sort === 'oldest') return left.timestamp - right.timestamp;
        if (sort === 'action-asc') return String(left.action || '').localeCompare(String(right.action || ''));
        if (sort === 'action-desc') return String(right.action || '').localeCompare(String(left.action || ''));
        return right.timestamp - left.timestamp;
    });
    document.querySelector('#auditTable').innerHTML = `<div class="audit-scroll table-wrap"><table><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Reason</th><th>Result</th></tr></thead><tbody>${rows.map(item => `<tr><td>${fmt(item.timestamp)}</td><td>${esc(item.admin_username || '—')}</td><td>${esc(item.action)}</td><td>${esc(item.target_username || item.target_user_id || '—')}</td><td>${esc(item.reason || '—')}</td><td><span class="pill ${item.success ? 'ok' : 'bad'}">${item.success ? 'Success' : 'Failed'}</span></td></tr>`).join('') || emptyRow(6, 'No audit records found.')}</tbody></table></div>`;
}

function modal({ eyebrow = 'Confirm action', title: modalTitle, message = '', fields = [], confirmText = 'Confirm', danger = false }) {
    return new Promise(resolve => {
        modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" type="button" aria-label="Close">×</button><span class="modal-eyebrow">${esc(eyebrow)}</span><h2 id="modal-title">${esc(modalTitle)}</h2><p class="modal-message">${esc(message)}</p><form class="modal-form">${fields.map(field => `<label>${esc(field.label)}${field.type === 'textarea' ? `<textarea name="${esc(field.name)}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''}>${esc(field.value || '')}</textarea>` : `<input name="${esc(field.name)}" type="${field.type || 'text'}" value="${esc(field.value || '')}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''} ${field.min ? `min="${field.min}"` : ''} ${field.readOnly ? 'readonly' : ''}>`}</label>`).join('')}<div class="modal-actions"><button type="button" class="modal-cancel">Cancel</button><button type="submit" class="${danger ? 'danger-button' : ''}">${esc(confirmText)}</button></div></form></section></div>`;
        const backdrop = modalRoot.querySelector('.modal-backdrop');
        let cleanup = () => {};
        const close = value => { cleanup(); modalRoot.innerHTML = ''; resolve(value); };
        modalRoot.querySelector('.modal-close').onclick = () => close(null);
        modalRoot.querySelector('.modal-cancel').onclick = () => close(null);
        modalRoot.querySelector('form').onsubmit = event => { event.preventDefault(); close(Object.fromEntries(new FormData(event.currentTarget).entries())); };
        modalRoot.querySelector('input, textarea')?.focus();
        const escape = event => { if (event.key === 'Escape') close(null); };
        cleanup = () => document.removeEventListener('keydown', escape);
        document.addEventListener('keydown', escape);
    });
}

async function kick(userId, username, serverId) { const answer = await modal({ eyebrow: 'Player control', title: `Kick ${username}?`, message: 'The player will be removed from their current server. This action will be added to the audit log.', confirmText: 'Queue kick', danger: true }); if (!answer) return; await api('/api/admin/kick', { method: 'POST', body: JSON.stringify({ userId, username, serverId, reason: 'Admin action' }) }); toast('Kick queued'); active(); }
async function ban(userId, username) { const answer = await modal({ eyebrow: 'Enforcement', title: `Ban ${username}`, message: 'Choose a reason and duration. Leave duration blank for a permanent ban.', fields: [{ name: 'reason', label: 'Reason', value: 'Admin action', type: 'textarea', required: true }, { name: 'durationMinutes', label: 'Duration in minutes', value: '1440', type: 'number', min: '1', placeholder: 'Blank for permanent' }], confirmText: 'Create ban', danger: true }); if (!answer) return; try { await api('/api/admin/ban', { method: 'POST', body: JSON.stringify({ userId, username, reason: answer.reason, durationMinutes: answer.durationMinutes === '' ? null : Number(answer.durationMinutes) }) }); toast('Ban created'); bans(); } catch (error) { toast(error.message); } }
async function unban(userId) { const answer = await modal({ eyebrow: 'Enforcement', title: 'Unban this player?', message: 'This will revoke the active ban and allow the player to return.', confirmText: 'Revoke ban' }); if (!answer) return; await api('/api/admin/unban', { method: 'POST', body: JSON.stringify({ userId }) }); toast('Player unbanned'); bans(); }
async function resetStats(userId) { const answer = await modal({ eyebrow: 'Destructive action', title: 'Reset saved stats?', message: 'This queues a reset for every saved stat on this player. This cannot be undone.', confirmText: 'Reset stats', danger: true }); if (!answer) return; await api('/api/admin/stats/reset', { method: 'POST', body: JSON.stringify({ userId, payload: {} }) }); toast('Reset queued'); player(userId); }
async function editStats(userId, stats) { const answer = await modal({ eyebrow: 'Player data', title: 'Edit saved stats', message: 'Enter valid JSON. The change will be queued for the Roblox server.', fields: [{ name: 'payload', label: 'Stats JSON', type: 'textarea', value: JSON.stringify(stats, null, 2), required: true }], confirmText: 'Queue update' }); if (!answer) return; let payload; try { payload = JSON.parse(answer.payload); } catch { toast('Invalid JSON'); return; } await api('/api/admin/stats/edit', { method: 'POST', body: JSON.stringify({ userId, payload }) }); toast('Stat edit queued'); player(userId); }
async function accountSettings() {
    const answer = await modal({ eyebrow: 'Account settings', title: 'Update your admin account', message: 'The username identifies you in audit logs and cannot be changed. You can update the display name and password.', fields: [{ name: 'username', label: 'Username · locked', value: currentUser?.username || 'huskyharlaw', readOnly: true }, { name: 'displayName', label: 'Display name', value: currentUser?.displayName || currentUser?.username || '', required: true }, { name: 'currentPassword', label: 'Current password', type: 'password', required: true }, { name: 'newPassword', label: 'New password', type: 'password', placeholder: 'Leave blank to keep current password' }], confirmText: 'Save changes' });
    if (!answer) return;
    try {
        const result = await api('/api/admin/profile', { method: 'POST', body: JSON.stringify(answer) });
        setProfile(result.user);
        toast('Account updated');
    } catch (error) {
        toast(error.message);
    }
}
function toast(message) { const element = document.querySelector('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }

const views = { dashboard, active, players, servers, bans, audit };
document.querySelectorAll('nav button').forEach(button => { button.onclick = () => { currentView = button.dataset.view; document.querySelectorAll('nav button').forEach(item => item.classList.remove('active')); button.classList.add('active'); views[currentView](); }; });
document.querySelector('#refresh-view').onclick = () => views[currentView]();
async function logout() { await api('/api/auth/logout', { method: 'POST' }); location.href = 'login.html'; }
document.querySelector('#logout').onclick = logout;
document.querySelector('#profile-logout').onclick = logout;
document.querySelector('#account-settings').onclick = () => { document.querySelector('#profile-menu').hidden = true; accountSettings(); };
document.querySelector('#profile-button').onclick = () => { const button = document.querySelector('#profile-button'); const menu = document.querySelector('#profile-menu'); menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); };
document.addEventListener('click', event => { if (!event.target.closest('.profile-control')) { document.querySelector('#profile-menu').hidden = true; document.querySelector('#profile-button').setAttribute('aria-expanded', 'false'); } });
setInterval(() => { document.querySelector('#clock').textContent = new Date().toLocaleTimeString(); }, 1000);
api('/api/me').then(response => { setProfile(response.user); document.querySelector('nav button[data-view="dashboard"]')?.classList.add('active'); dashboard(); }).catch(showConnectionError);
setInterval(() => { if (title.textContent === 'Dashboard') dashboard(); if (title.textContent === 'Active Players') active(); }, 5000);