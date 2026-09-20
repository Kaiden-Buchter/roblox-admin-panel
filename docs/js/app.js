const app = document.querySelector('#app');
const title = document.querySelector('#title');
const modalRoot = document.querySelector('#modal-root');
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fmt = timestamp => timestamp ? new Date(timestamp).toLocaleString() : '—';

function card(label, value, tone = '') {
    return `<div class="stat ${tone}"><span>${label}</span><strong>${value ?? 0}</strong><i></i></div>`;
}

function emptyRow(columns, message) {
    return `<tr><td colspan="${columns}" class="empty-state">${message}</td></tr>`;
}

async function dashboard() {
    title.textContent = 'Dashboard';
    const data = await api('/api/dashboard');
    app.innerHTML = `<div class="command-strip"><div><span class="live-dot"></span><b>Operations center</b><small>Live game telemetry</small></div><button class="subtle-button" onclick="dashboard()">Refresh data</button></div><div class="stats">${card('Active Players', data.activePlayers, 'stat-live')}${card('Saved Players', data.players)}${card('Live Servers', data.servers, 'stat-live')}${card('Active Bans', data.bans, 'stat-alert')}</div><div class="grid2 dashboard-grid"><div class="panel"><div class="panel-head"><div><h2>Recent audit activity</h2><small>Administrative actions across the game</small></div><button class="subtle-button" onclick="audit()">View all</button></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Result</th></tr></thead><tbody>${data.recentAudit.map(item => `<tr><td>${fmt(item.timestamp)}</td><td>${esc(item.admin_username || 'System')}</td><td><b>${esc(item.action)}</b></td><td>${esc(item.target_username || item.target_user_id || '—')}</td><td><span class="pill ${item.success ? 'ok' : 'bad'}">${item.success ? 'Success' : 'Failed'}</span></td></tr>`).join('') || emptyRow(5, 'No audit activity yet.')}</tbody></table></div></div><div class="panel pulse-panel"><div class="panel-head"><div><h2>System pulse</h2><small>Current service snapshot</small></div><span class="status-mark">Healthy</span></div><div class="pulse-list"><div><span>Player presence</span><b>${data.activePlayers || 0} online</b></div><div><span>Server fleet</span><b>${data.servers || 0} live</b></div><div><span>Enforcement</span><b>${data.bans || 0} active bans</b></div></div><button class="wide-button" onclick="servers()">Inspect live servers</button></div></div>`;
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
    app.innerHTML = `<div class="grid2"><div class="panel profile-panel"><div class="profile-heading"><div class="avatar">${esc(data.username?.slice(0, 1).toUpperCase())}</div><div><h2>${esc(data.username)}</h2><small>Roblox player profile</small></div></div><div class="detail-list"><div><span>Roblox ID</span><b>${esc(data.user_id)}</b></div><div><span>Last seen</span><b>${fmt(data.last_seen_at)}</b></div><div><span>Last server</span><b>${esc(data.last_server_id || 'Offline')}</b></div></div><div class="actions"><button onclick="kick('${esc(data.user_id)}','${esc(data.username)}','${esc(data.last_server_id || '')}')">Kick</button><button onclick="ban('${esc(data.user_id)}','${esc(data.username)}')">Ban</button><button class="danger-button" onclick="resetStats('${esc(data.user_id)}')">Reset Stats</button></div></div><div class="panel"><div class="panel-head"><div><h2>Saved stats</h2><small>Data cached from the Roblox server</small></div><button onclick="editStats('${esc(data.user_id)}',${JSON.stringify(data.stats).replace(/</g, '\\u003c')})">Edit JSON</button></div><pre class="bigpre">${esc(JSON.stringify(data.stats, null, 2))}</pre></div></div><div class="panel"><h2>Ban history</h2><pre>${esc(JSON.stringify(data.bans, null, 2))}</pre></div>`;
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
    app.innerHTML = `<div class="panel"><div class="toolbar"><div><h2>Audit trail</h2><small>Every administrative action is recorded here</small></div><div class="search-group"><input id="auditSearch" placeholder="Admin, action, username, ID"><button onclick="loadAudit()">Search</button></div></div><div id="auditTable"></div></div>`;
    await loadAudit();
}

async function loadAudit() {
    const query = document.querySelector('#auditSearch')?.value || '';
    const rows = await api('/api/audit-logs?q=' + encodeURIComponent(query));
    document.querySelector('#auditTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Reason</th><th>Result</th></tr></thead><tbody>${rows.map(item => `<tr><td>${fmt(item.timestamp)}</td><td>${esc(item.admin_username || '—')}</td><td>${esc(item.action)}</td><td>${esc(item.target_username || item.target_user_id || '—')}</td><td>${esc(item.reason || '—')}</td><td><span class="pill ${item.success ? 'ok' : 'bad'}">${item.success ? 'Success' : 'Failed'}</span></td></tr>`).join('') || emptyRow(6, 'No audit records found.')}</tbody></table></div>`;
}

function modal({ eyebrow = 'Confirm action', title: modalTitle, message = '', fields = [], confirmText = 'Confirm', danger = false }) {
    return new Promise(resolve => {
        modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" type="button" aria-label="Close">×</button><span class="modal-eyebrow">${esc(eyebrow)}</span><h2 id="modal-title">${esc(modalTitle)}</h2><p class="modal-message">${esc(message)}</p><form class="modal-form">${fields.map(field => `<label>${esc(field.label)}${field.type === 'textarea' ? `<textarea name="${esc(field.name)}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''}>${esc(field.value || '')}</textarea>` : `<input name="${esc(field.name)}" type="${field.type || 'text'}" value="${esc(field.value || '')}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''} ${field.min ? `min="${field.min}"` : ''}>`}</label>`).join('')}<div class="modal-actions"><button type="button" class="modal-cancel">Cancel</button><button type="submit" class="${danger ? 'danger-button' : ''}">${esc(confirmText)}</button></div></form></section></div>`;
        const backdrop = modalRoot.querySelector('.modal-backdrop');
        let cleanup = () => {};
        const close = value => { cleanup(); modalRoot.innerHTML = ''; resolve(value); };
        modalRoot.querySelector('.modal-close').onclick = () => close(null);
        modalRoot.querySelector('.modal-cancel').onclick = () => close(null);
        backdrop.onclick = event => { if (event.target === backdrop) close(null); };
        modalRoot.querySelector('form').onsubmit = event => { event.preventDefault(); close(Object.fromEntries(new FormData(event.currentTarget).entries())); };
        modalRoot.querySelector('input, textarea')?.focus();
        const escape = event => { if (event.key === 'Escape') close(null); };
        cleanup = () => document.removeEventListener('keydown', escape);
        document.addEventListener('keydown', escape);
    });
}

async function kick(userId, username, serverId) { const answer = await modal({ eyebrow: 'Player control', title: `Kick ${username}?`, message: 'The player will be removed from their current server. This action will be added to the audit log.', confirmText: 'Queue kick', danger: true }); if (!answer) return; await api('/api/admin/kick', { method: 'POST', body: JSON.stringify({ userId, username, serverId, reason: 'Admin action' }) }); toast('Kick queued'); active(); }
async function ban(userId, username) { const answer = await modal({ eyebrow: 'Enforcement', title: `Ban ${username}`, message: 'Choose a reason and duration. Leave duration blank for a permanent ban.', fields: [{ name: 'reason', label: 'Reason', value: 'Admin action', type: 'textarea', required: true }, { name: 'durationMinutes', label: 'Duration in minutes', value: '1440', type: 'number', min: '1', placeholder: 'Blank for permanent' }], confirmText: 'Create ban', danger: true }); if (!answer) return; await api('/api/admin/ban', { method: 'POST', body: JSON.stringify({ userId, username, reason: answer.reason, durationMinutes: answer.durationMinutes === '' ? null : Number(answer.durationMinutes) }) }); toast('Ban created'); bans(); }
async function unban(userId) { const answer = await modal({ eyebrow: 'Enforcement', title: 'Unban this player?', message: 'This will revoke the active ban and allow the player to return.', confirmText: 'Revoke ban' }); if (!answer) return; await api('/api/admin/unban', { method: 'POST', body: JSON.stringify({ userId }) }); toast('Player unbanned'); bans(); }
async function resetStats(userId) { const answer = await modal({ eyebrow: 'Destructive action', title: 'Reset saved stats?', message: 'This queues a reset for every saved stat on this player. This cannot be undone.', confirmText: 'Reset stats', danger: true }); if (!answer) return; await api('/api/admin/stats/reset', { method: 'POST', body: JSON.stringify({ userId, payload: {} }) }); toast('Reset queued'); player(userId); }
async function editStats(userId, stats) { const answer = await modal({ eyebrow: 'Player data', title: 'Edit saved stats', message: 'Enter valid JSON. The change will be queued for the Roblox server.', fields: [{ name: 'payload', label: 'Stats JSON', type: 'textarea', value: JSON.stringify(stats, null, 2), required: true }], confirmText: 'Queue update' }); if (!answer) return; let payload; try { payload = JSON.parse(answer.payload); } catch { toast('Invalid JSON'); return; } await api('/api/admin/stats/edit', { method: 'POST', body: JSON.stringify({ userId, payload }) }); toast('Stat edit queued'); player(userId); }
function toast(message) { const element = document.querySelector('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }

const views = { dashboard, active, players, servers, bans, audit };
document.querySelectorAll('nav button').forEach(button => { button.onclick = () => views[button.dataset.view](); });
document.querySelector('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = 'login.html'; };
setInterval(() => { document.querySelector('#clock').textContent = new Date().toLocaleTimeString(); }, 1000);
api('/api/me').then(() => dashboard()).catch(() => {});
setInterval(() => { if (title.textContent === 'Dashboard') dashboard(); if (title.textContent === 'Active Players') active(); }, 5000);