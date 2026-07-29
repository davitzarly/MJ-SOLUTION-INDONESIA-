/* ============================================================
   SignageOS Control Panel — Application Logic (Supabase Version)
   ============================================================ */

// ============================================================
// KONFIGURASI SUPABASE — GANTI DUA BARIS INI SAJA!
// ============================================================
const SUPABASE_URL = 'https://tizgvonjugxgfhrusxac.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_oFYoO21lLMowA_5R2nn9_A_g9aJ8kPH';

// ============================================================
// 1. DATABASE LAYER — Supabase REST API
// ============================================================

async function supabaseFetch(table, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
    };
    
    if (options.method === 'POST' || options.method === 'PATCH') {
        headers['Prefer'] = 'return=representation';
    }

    const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Supabase Error:', error);
        throw new Error(error.message || 'Error fetching data');
    }

    if (response.status === 204) return null;
    return response.json();
}

// -------------------------------------------------------
// DEVICES — CRUD
// -------------------------------------------------------
async function getDevices() {
    return await supabaseFetch('devices?select=*&order=created_at.asc');
}

async function getDevice(id) {
    const data = await supabaseFetch(`devices?id=eq.${id}&select=*`);
    return data?.[0] || null;
}

async function createDevice(name, location) {
    const data = await supabaseFetch('devices', {
        method: 'POST',
        body: JSON.stringify({ nama: name.trim(), lokasi: location.trim(), status: 'offline' })
    });
    addLog('command', `Device baru ditambahkan: ${name.trim()}`);
    return data?.[0];
}

async function updateDevice(id, name, location) {
    const data = await supabaseFetch(`devices?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nama: name.trim(), lokasi: location.trim() })
    });
    addLog('command', `Device diperbarui: ${name.trim()}`);
    return data?.[0];
}

async function deleteDevice(id) {
    const device = await getDevice(id);
    await supabaseFetch(`devices?id=eq.${id}`, { method: 'DELETE' });
    await supabaseFetch(`playlists?device_id=eq.${id}`, { method: 'DELETE' });
    if (device) addLog('command', `Device dihapus: ${device.nama}`);
}

async function updateDeviceStatus(id, status) {
    const device = await getDevice(id);
    if (!device || device.status === status) return;
    
    await supabaseFetch(`devices?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: status, last_seen: new Date().toISOString() })
    });
    
    addLog(
        status === 'online' ? 'connect' : 'disconnect',
        `Device ${device.nama} sekarang ${status.toUpperCase()}`
    );
}

async function setDeviceActiveContent(deviceId, contentId) {
    await supabaseFetch(`devices?id=eq.${deviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active_content_id: contentId })
    });
}

// -------------------------------------------------------
// CONTENTS — CRUD
// -------------------------------------------------------
async function getContents() {
    return await supabaseFetch('contents?select=*&order=created_at.asc');
}

async function getContent(id) {
    const data = await supabaseFetch(`contents?id=eq.${id}&select=*`);
    return data?.[0] || null;
}

async function createContent(title, type, payload) {
    const data = await supabaseFetch('contents', {
        method: 'POST',
        body: JSON.stringify({ judul: title.trim(), tipe: type, payload: payload.trim() })
    });
    addLog('command', `Konten baru ditambahkan: ${title.trim()} (${type})`);
    return data?.[0];
}

async function updateContent(id, title, type, payload) {
    const data = await supabaseFetch(`contents?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ judul: title.trim(), tipe: type, payload: payload.trim() })
    });
    addLog('command', `Konten diperbarui: ${title.trim()}`);
    return data?.[0];
}

async function deleteContent(id) {
    const content = await getContent(id);
    await supabaseFetch(`contents?id=eq.${id}`, { method: 'DELETE' });
    if (content) addLog('command', `Konten dihapus: ${content.judul}`);
}

// -------------------------------------------------------
// PLAYLISTS
// -------------------------------------------------------
async function getPlaylists() {
    return await supabaseFetch('playlists?select=*');
}

async function getPlaylist(deviceId) {
    const data = await supabaseFetch(`playlists?device_id=eq.${deviceId}&select=*`);
    return data?.[0] || null;
}

async function setPlaylist(deviceId, contentIds) {
    const existing = await getPlaylist(deviceId);
    if (existing) {
        await supabaseFetch(`playlists?id=eq.${existing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content_ids: contentIds })
        });
    } else {
        await supabaseFetch('playlists', {
            method: 'POST',
            body: JSON.stringify({ device_id: deviceId, content_ids: contentIds })
        });
    }
    const device = await getDevice(deviceId);
    addLog('push', `Playlist diperbarui untuk device ${device ? device.nama : deviceId}`);
}

// -------------------------------------------------------
// LOGS
// -------------------------------------------------------
async function getLogs() {
    return await supabaseFetch('logs?select=*&order=time.desc&limit=200');
}

function addLog(type, message) {
    fetch(`${SUPABASE_URL}/rest/v1/logs`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ type, message, time: new Date().toISOString() })
    }).catch(err => console.error('Log error:', err));
}

async function clearLogs() {
    await supabaseFetch(`logs?id=neq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
    await renderLogs();
    showToast('success', 'Log Dihapus', 'Semua log aktivitas telah dihapus');
}


// ============================================================
// 2. WEBSOCKET — Supabase Realtime
// ============================================================

class RealtimeWebSocket {
    constructor() {
        this.listeners = {};
        this.ws = null;
    }

    connect() {
        const wsUrl = `${SUPABASE_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket Terhubung');
            this.ws.send(JSON.stringify({
                topic: `realtime:public:devices`,
                event: 'phx_join',
                payload: {},
                ref: '1'
            }));
        };

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.event === 'UPDATE' && msg.payload) {
                this.emit('status_change', { status: msg.payload.new?.status, device: msg.payload.new });
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket Terputus, reconnect dalam 3 detik...');
            setTimeout(() => this.connect(), 3000);
        };
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        (this.listeners[event] || []).forEach(cb => cb(data));
    }

    disconnect() {
        if (this.ws) this.ws.close();
    }
}

const wsServer = new RealtimeWebSocket();


// ============================================================
// 3. AUTENTIKASI — JWT Sederhana
// ============================================================

const DB_KEYS = { auth: 'signage_auth' };

function simpleJWT(payload) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body   = btoa(JSON.stringify({ ...payload, iat: Date.now() }));
    const sig    = btoa('signage-os-secret-' + body.slice(-10));
    return `${header}.${body}.${sig}`;
}

function verifyJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        if (Date.now() - payload.iat > 86400000) return null;
        return payload;
    } catch { return null; }
}

function handleLogin() {
    localStorage.clear(); // Hapus semua cache lama
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');

    if (user === 'admin' && pass === 'davit2009') {
        const token = simpleJWT({ username: user, role: 'admin' });
        localStorage.setItem(DB_KEYS.auth, token);
        errEl.style.display = 'none';
        showApp();
    } else {
        errEl.textContent = 'Username atau password salah';
        errEl.style.display = 'block';
    }
}

function handleLogout() {
    localStorage.removeItem(DB_KEYS.auth);
    document.getElementById('appLayout').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
}

function checkAuth() {
    const token = localStorage.getItem(DB_KEYS.auth);
    if (token && verifyJWT(token)) {
        showApp();
    } else {
        localStorage.removeItem(DB_KEYS.auth);
        document.getElementById('loginPage').style.display = 'flex';
    }
}

function showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('appLayout').style.display = 'flex';
    initApp();
}


// ============================================================
// 4. TOAST NOTIFICATION
// ============================================================

const TOAST_ICONS = {
    success: 'fa-check-circle', error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle', info: 'fa-info-circle'
};

function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${TOAST_ICONS[type]} toast-icon"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Tangkap semua error async yang tidak ter-handle (mis. fetch ke Supabase gagal)
// supaya user tidak melihat tombol "diam saja" tanpa keterangan.
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled error:', event.reason);
    const msg = event.reason?.message || 'Terjadi kesalahan tak terduga';
    showToast('error', 'Gagal', msg);
});


// ============================================================
// 5. NAVIGASI & HELPERS
// ============================================================

let currentPage = 'dashboard';

function formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function formatTimeShort(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div'); div.textContent = str; return div.innerHTML;
}
function statusBadge(status) {
    return status === 'online' ? '<span class="status-badge status-online"><span class="dot"></span>Online</span>' : '<span class="status-badge status-offline"><span class="dot"></span>Offline</span>';
}
function typeBadge(type) {
    const map = { image: { cls: 'type-image', icon: 'fa-image', label: 'Image' }, text: { cls: 'type-text', icon: 'fa-font', label: 'Text' }, video: { cls: 'type-video', icon: 'fa-video', label: 'Video' }, url: { cls: 'type-url', icon: 'fa-globe', label: 'URL' } };
    const t = map[type] || map.image;
    return `<span class="type-badge ${t.cls}"><i class="fas ${t.icon}"></i> ${t.label}</span>`;
}
function logEntryHTML(log) {
    const clsMap = { connect: 'log-type-connect', disconnect: 'log-type-disconnect', push: 'log-type-push', command: 'log-type-command' };
    return `<div class="log-entry"><span class="log-time">${formatTimeShort(log.time)}</span><span class="log-type ${clsMap[log.type] || 'log-type-command'}">${log.type}</span><span class="log-msg">${esc(log.message)}</span></div>`;
}

async function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    
    switch (page) {
        case 'dashboard': await renderDashboard(); break;
        case 'devices':   await renderDevices();   break;
        case 'contents':  await renderContents();  break;
        case 'clients':   await renderClientPage(); break;
        case 'logs':      await renderLogs();      break;
    }
    closeSidebarMobile();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarBackdrop').classList.toggle('open');
}
function closeSidebarMobile() {
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarBackdrop').classList.remove('open');
    }
}


// ============================================================
// 6. DASHBOARD
// ============================================================

async function renderDashboard() {
    const devices  = await getDevices();
    const contents = await getContents();
    const online  = devices.filter(d => d.status === 'online').length;
    const offline = devices.length - online;

    document.getElementById('statGrid').innerHTML = `
        <div class="stat-card animate-in" style="animation-delay:0.05s"><div class="stat-glow" style="background:var(--accent)"></div><div class="stat-icon" style="background:var(--accent-dim);color:var(--accent)"><i class="fas fa-desktop"></i></div><div class="stat-value">${devices.length}</div><div class="stat-label">Total Device</div></div>
        <div class="stat-card animate-in" style="animation-delay:0.1s"><div class="stat-glow" style="background:var(--accent)"></div><div class="stat-icon" style="background:var(--accent-dim);color:var(--accent)"><i class="fas fa-wifi"></i></div><div class="stat-value">${online}</div><div class="stat-label">Online</div></div>
        <div class="stat-card animate-in" style="animation-delay:0.15s"><div class="stat-glow" style="background:var(--danger)"></div><div class="stat-icon" style="background:var(--danger-dim);color:var(--danger)"><i class="fas fa-times-circle"></i></div><div class="stat-value">${offline}</div><div class="stat-label">Offline</div></div>
        <div class="stat-card animate-in" style="animation-delay:0.2s"><div class="stat-glow" style="background:var(--info)"></div><div class="stat-icon" style="background:var(--info-dim);color:var(--info)"><i class="fas fa-photo-video"></i></div><div class="stat-value">${contents.length}</div><div class="stat-label">Total Konten</div></div>`;

    const recent = devices.slice(-5).reverse();
    const tbody = document.getElementById('dashDeviceTable');
    tbody.innerHTML = recent.length === 0
        ? '<tr><td colspan="4" style="text-align:center;color:#4a5568;padding:32px">Belum ada device</td></tr>'
        : recent.map(d => `<tr><td style="font-weight:600">${esc(d.nama)}</td><td style="color:var(--fg-muted)">${esc(d.lokasi)}</td><td>${statusBadge(d.status)}</td><td style="color:var(--fg-muted);font-family:'JetBrains Mono',monospace;font-size:12px">${formatTimeShort(d.last_seen)}</td></tr>`).join('');

    const logs = await getLogs();
    document.getElementById('dashLogEntries').innerHTML = logs.length === 0
        ? '<div style="text-align:center;color:#4a5568;padding:32px;font-size:13px">Belum ada aktivitas</div>'
        : logs.slice(0, 8).map(logEntryHTML).join('');

    document.getElementById('deviceCountBadge').textContent = devices.length;
}


// ============================================================
// 7. DEVICES — Render & CRUD
// ============================================================

async function renderDevices() {
    const devices  = await getDevices();
    const contents = await getContents();
    const search   = (document.getElementById('deviceSearch')?.value || '').toLowerCase();
    const filtered = devices.filter(d => d.nama.toLowerCase().includes(search) || d.lokasi.toLowerCase().includes(search));

    const tbody = document.getElementById('deviceTableBody');
    const empty = document.getElementById('deviceEmptyState');

    if (filtered.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; } 
    else {
        empty.style.display = 'none';
        tbody.innerHTML = filtered.map(d => {
            const active = d.active_content_id ? contents.find(c => c.id === d.active_content_id) : null;
            return `<tr>
                <td style="font-weight:600">${esc(d.nama)}</td>
                <td style="color:var(--fg-muted)">${esc(d.lokasi)}</td>
                <td>${statusBadge(d.status)}</td>
                <td>${active ? `<span style="color:var(--info);font-size:12px"><i class="fas fa-play-circle" style="margin-right:4px"></i>${esc(active.judul)}</span>` : '<span style="color:#4a5568;font-size:12px">-</span>'}</td>
                <td style="color:var(--fg-muted);font-family:'JetBrains Mono',monospace;font-size:12px">${formatTimeShort(d.last_seen)}</td>
                <td><div class="action-btns">
                    <button class="btn btn-sm btn-info" data-action="push" data-id="${d.id}" title="Push Konten"><i class="fas fa-paper-plane"></i></button>
                    <button class="btn btn-sm btn-secondary" data-action="edit-device" data-id="${d.id}" title="Edit"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-sm btn-danger" data-action="delete-device" data-id="${d.id}" title="Hapus"><i class="fas fa-trash"></i></button>
                </div></td></tr>`;
        }).join('');
    }
    document.getElementById('deviceCountBadge').textContent = devices.length;
}

async function openDeviceModal(id) {
    const modal = document.getElementById('deviceModal');
    if (id) {
        const d = await getDevice(id); if (!d) return;
        document.getElementById('deviceModalTitle').textContent = 'Edit Device';
        document.getElementById('editDeviceId').value = id;
        document.getElementById('deviceName').value = d.nama;
        document.getElementById('deviceLocation').value = d.lokasi;
    } else {
        document.getElementById('deviceModalTitle').textContent = 'Tambah Device';
        document.getElementById('editDeviceId').value = '';
        document.getElementById('deviceName').value = '';
        document.getElementById('deviceLocation').value = '';
    }
    modal.classList.add('active');
}

async function saveDevice() {
    const id = document.getElementById('editDeviceId').value;
    const name = document.getElementById('deviceName').value.trim();
    const location = document.getElementById('deviceLocation').value.trim();
    if (!name) { showToast('error', 'Error', 'Nama device wajib diisi'); return; }
    if (!location) { showToast('error', 'Error', 'Lokasi wajib diisi'); return; }

    if (id) { await updateDevice(id, name, location); showToast('success', 'Berhasil', `Device "${name}" diperbarui`); }
    else { await createDevice(name, location); showToast('success', 'Berhasil', `Device "${name}" ditambahkan`); }

    document.getElementById('deviceModal').classList.remove('active');
    await renderDevices();
}

async function confirmDeleteDevice(id) {
    const d = await getDevice(id); if (!d) return;
    if (confirm(`Hapus device "${d.nama}"?`)) {
        await deleteDevice(id);
        await renderDevices();
        showToast('success', 'Dihapus', `Device "${d.nama}" telah dihapus`);
    }
}


// ============================================================
// 8. CONTENTS — Render & CRUD
// ============================================================

async function renderContents() {
    const contents = await getContents();
    const search = (document.getElementById('contentSearch')?.value || '').toLowerCase();
    const filtered = contents.filter(c => c.judul.toLowerCase().includes(search) || c.tipe.toLowerCase().includes(search));

    const tbody = document.getElementById('contentTableBody');
    const empty = document.getElementById('contentEmptyState');

    if (filtered.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; }
    else {
        empty.style.display = 'none';
        tbody.innerHTML = filtered.map(c => {
            const payloadStr = c.tipe === 'text' ? esc(c.payload.substring(0, 50)) + (c.payload.length > 50 ? '...' : '') : `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg-muted);word-break:break-all">${esc(c.payload.substring(0, 60))}${c.payload.length > 60 ? '...' : ''}</span>`;
            return `<tr>
                <td style="font-weight:600">${esc(c.judul)}</td>
                <td>${typeBadge(c.tipe)}</td>
                <td>${payloadStr}</td>
                <td style="color:var(--fg-muted);font-size:12px">${formatTime(c.created_at)}</td>
                <td><div class="action-btns">
                    <button class="btn btn-sm btn-secondary" data-action="edit-content" data-id="${c.id}" title="Edit"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-sm btn-danger" data-action="delete-content" data-id="${c.id}" title="Hapus"><i class="fas fa-trash"></i></button>
                </div></td></tr>`;
        }).join('');
    }
}

function toggleContentPayload() {
    const type = document.getElementById('contentType').value;
    const urlGroup = document.getElementById('payloadUrlGroup');
    const txtGroup = document.getElementById('payloadTextGroup');
    const label = document.getElementById('payloadLabel');
    const input = document.getElementById('contentPayload');
    if (type === 'text') { urlGroup.style.display = 'none'; txtGroup.style.display = 'block'; }
    else {
        urlGroup.style.display = 'block'; txtGroup.style.display = 'none';
        const configs = { image: { label: 'URL Gambar', ph: 'https://picsum.photos/seed/promo/800/600' }, video: { label: 'URL Video', ph: 'https://www.w3schools.com/html/mov_bbb.mp4' }, url: { label: 'URL Website', ph: 'https://example.com' } };
        const cfg = configs[type] || configs.image; label.textContent = cfg.label; input.placeholder = cfg.ph;
    }
}

async function openContentModal(id) {
    const modal = document.getElementById('contentModal');
    if (id) {
        const c = await getContent(id); if (!c) return;
        document.getElementById('contentModalTitle').textContent = 'Edit Konten';
        document.getElementById('editContentId').value = id;
        document.getElementById('contentTitle').value = c.judul;
        document.getElementById('contentType').value = c.tipe;
        if (c.tipe === 'text') { document.getElementById('contentTextPayload').value = c.payload; document.getElementById('contentPayload').value = ''; }
        else { document.getElementById('contentPayload').value = c.payload; document.getElementById('contentTextPayload').value = ''; }
    } else {
        document.getElementById('contentModalTitle').textContent = 'Tambah Konten';
        document.getElementById('editContentId').value = ''; document.getElementById('contentTitle').value = '';
        document.getElementById('contentType').value = 'image'; document.getElementById('contentPayload').value = ''; document.getElementById('contentTextPayload').value = '';
    }
    toggleContentPayload(); modal.classList.add('active');
}

async function saveContent() {
    const id = document.getElementById('editContentId').value;
    const title = document.getElementById('contentTitle').value.trim();
    const type = document.getElementById('contentType').value;
    const payload = type === 'text' ? document.getElementById('contentTextPayload').value.trim() : document.getElementById('contentPayload').value.trim();
    if (!title) { showToast('error', 'Error', 'Judul konten wajib diisi'); return; }
    if (!payload) { showToast('error', 'Error', 'Payload / URL wajib diisi'); return; }

    if (id) { await updateContent(id, title, type, payload); showToast('success', 'Berhasil', `Konten "${title}" diperbarui`); }
    else { await createContent(title, type, payload); showToast('success', 'Berhasil', `Konten "${title}" ditambahkan`); }

    document.getElementById('contentModal').classList.remove('active');
    await renderContents();
}

async function confirmDeleteContent(id) {
    const c = await getContent(id); if (!c) return;
    if (confirm(`Hapus konten "${c.judul}"?`)) {
        await deleteContent(id);
        await renderContents();
        showToast('success', 'Dihapus', `Konten "${c.judul}" telah dihapus`);
    }
}


// ============================================================
// 9. PUSH CONTENT
// ============================================================

async function openPushModal(deviceId) {
    const device = await getDevice(deviceId); if (!device) return;
    document.getElementById('pushDeviceId').value = deviceId;
    document.getElementById('pushDeviceName').textContent = device.nama;
    const contents = await getContents();
    const list = document.getElementById('pushContentList');
    list.innerHTML = contents.length === 0
        ? '<div style="text-align:center;color:#4a5568;padding:24px">Belum ada konten.</div>'
        : contents.map(c => `<div class="push-item" data-action="do-push" data-device="${deviceId}" data-content="${c.id}">${typeBadge(c.tipe)}<span>${esc(c.judul)}</span><button class="btn btn-sm btn-primary"><i class="fas fa-paper-plane"></i> Push</button></div>`).join('');
    document.getElementById('pushModal').classList.add('active');
}

async function pushContentToDevice(deviceId, contentId) {
    const device = await getDevice(deviceId);
    const content = await getContent(contentId);
    if (!device || !content) return;

    await setDeviceActiveContent(deviceId, contentId);
    document.getElementById('pushModal').classList.remove('active');

    addLog('push', `Konten "${content.judul}" di-push ke device "${device.nama}"`);
    showToast('success', 'Push Berhasil', `"${content.judul}" dikirim ke ${device.nama}`);

    if (currentPage === 'devices') await renderDevices();
    if (currentPage === 'dashboard') await renderDashboard();
}


// ============================================================
// 10. PLAYLIST
// ============================================================

async function openPlaylistModal() {
    const modal = document.getElementById('playlistModal');
    const devices = await getDevices();
    const select = document.getElementById('playlistDeviceSelect');
    select.innerHTML = '<option value="">-- Pilih Device --</option>' + devices.map(d => `<option value="${d.id}">${esc(d.nama)} — ${esc(d.lokasi)}</option>`).join('');
    document.getElementById('playlistContentArea').style.display = 'none';
    modal.classList.add('active');
}

async function loadPlaylistForDevice() {
    const deviceId = document.getElementById('playlistDeviceSelect').value;
    const area = document.getElementById('playlistContentArea');
    if (!deviceId) { area.style.display = 'none'; return; }
    area.style.display = 'block';

    const contents = await getContents();
    const playlist = await getPlaylist(deviceId);
    const currentIds = playlist ? playlist.content_ids : [];

    const availEl = document.getElementById('playlistAvailableContents');
    availEl.innerHTML = contents.length === 0 ? '<p style="font-size:13px;color:#4a5568">Belum ada konten.</p>'
        : contents.map(c => {
            const inList = currentIds.includes(c.id);
            return `<div class="playlist-item-add" style="border-color:${inList ? 'var(--accent)' : 'var(--border)'};${inList ? 'opacity:0.5' : ''}">${typeBadge(c.tipe)}<span>${esc(c.judul)}</span>${inList ? '<span class="in-playlist">Sudah ditambahkan</span>' : `<button class="btn btn-sm btn-primary" data-action="add-to-pl" data-device="${deviceId}" data-content="${c.id}"><i class="fas fa-plus"></i> Tambah</button>`}</div>`;
        }).join('');

    const currEl = document.getElementById('playlistCurrentItems');
    currEl.innerHTML = currentIds.length === 0 ? '<p class="playlist-empty">Playlist kosong</p>'
        : currentIds.map((cid, idx) => {
            const c = contents.find(x => x.id === cid); if (!c) return '';
            return `<div class="playlist-order-item"><span class="playlist-order-num">${idx + 1}</span>${typeBadge(c.tipe)}<span>${esc(c.judul)}</span><button class="btn btn-sm btn-danger" data-action="remove-from-pl" data-device="${deviceId}" data-content="${cid}"><i class="fas fa-times"></i></button></div>`;
        }).join('');
}

async function addToPlaylist(deviceId, contentId) {
    const playlist = await getPlaylist(deviceId);
    let currentIds = playlist ? playlist.content_ids : [];
    if (!currentIds.includes(contentId)) currentIds.push(contentId);
    await setPlaylist(deviceId, currentIds);
    await loadPlaylistForDevice();
}

async function removeFromPlaylist(deviceId, contentId) {
    const playlist = await getPlaylist(deviceId);
    if (playlist) {
        const newIds = playlist.content_ids.filter(id => id !== contentId);
        await setPlaylist(deviceId, newIds);
    }
    await loadPlaylistForDevice();
}


// ============================================================
// 11. DEVICE CLIENT SIMULATOR
// ============================================================

let clientWS = null;
let clientCurrentDeviceId = null;
let clientPlaylistIndex = 0;
let clientPlaylistTimer = null;
let clientBarsTimer = null;

async function renderClientPage() {
    const devices = await getDevices();
    const select = document.getElementById('clientDeviceSelect');
    const current = select.value;
    select.innerHTML = '<option value="">-- Pilih Device --</option>' + devices.map(d => `<option value="${d.id}">${esc(d.nama)} — ${esc(d.lokasi)} [${d.status}]</option>`).join('');
    if (current && devices.find(d => d.id === current)) select.value = current;
}

async function switchClientDevice() {
    const deviceId = document.getElementById('clientDeviceSelect').value;
    if (clientWS) { clientWS.disconnect(); clientWS = null; }
    clearTimeout(clientPlaylistTimer); clearTimeout(clientBarsTimer);
    clientCurrentDeviceId = null; clientPlaylistIndex = 0;

    if (!deviceId) {
        document.getElementById('clientPreviewArea').innerHTML = `<div class="client-placeholder"><i class="fas fa-tv"></i><p>Pilih device untuk melihat preview</p></div>`;
        return;
    }

    clientCurrentDeviceId = deviceId;
    const device = await getDevice(deviceId);
    await renderClientView(device, null);

    await updateDeviceStatus(deviceId, 'online');
    await renderClientPage();
    await startClientPlaylist(deviceId);
}

async function renderClientView(device, content) {
    if (!device) return;
    const area = document.getElementById('clientPreviewArea');
    if (!content) { content = device.active_content_id ? await getContent(device.active_content_id) : null; }

    let contentHTML = '';
    if (content) {
        switch (content.tipe) {
            case 'image': contentHTML = `<img src="${esc(content.payload)}" alt="${esc(content.judul)}" style="animation:contentSlide 0.5s ease-out" onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/800/600'">`; break;
            case 'text': contentHTML = `<div class="text-content" style="animation:contentSlide 0.5s ease-out">${esc(content.payload)}</div>`; break;
            case 'video': contentHTML = `<video class="video-content" controls autoplay loop style="animation:contentSlide 0.5s ease-out"><source src="${esc(content.payload)}" type="video/mp4">Browser tidak mendukung video.</video>`; break;
            case 'url': contentHTML = `<iframe src="${esc(content.payload)}" class="url-content" sandbox="allow-scripts allow-same-origin" style="animation:contentSlide 0.5s ease-out"></iframe>`; break;
        }
    } else {
        contentHTML = `<div class="client-no-content"><i class="fas fa-photo-video"></i><p>Tidak ada konten yang ditampilkan</p><p class="sub">Push konten dari dashboard admin</p></div>`;
    }

    const statusColor = device.status === 'online' ? 'var(--accent)' : '#94a3b8';
    const statusText = device.status === 'online' ? 'Connected' : 'Disconnected';
    const glowStyle = device.status === 'online' ? 'animation:pulseGlow 2s infinite' : '';

    area.innerHTML = `
        <div class="client-topbar" id="clientTopbar"><div style="display:flex;align-items:center;gap:10px"><i class="fas fa-tv" style="color:var(--accent);font-size:14px"></i><span class="device-name">${esc(device.nama)}</span><span style="color:#4a5568;font-size:11px">|</span><span style="color:var(--fg-muted);font-size:12px">${esc(device.lokasi)}</span></div><div class="conn-status"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor};${glowStyle}"></span><span style="color:${statusColor};font-size:12px;font-weight:600">${statusText}</span></div></div>
        <div class="client-display-area"><div class="content-display" id="clientContentDisplay">${contentHTML}</div></div>
        <div class="client-playlist-bar" id="clientPlaylistBar"><i class="fas fa-list-ol" style="color:var(--fg-muted);font-size:12px"></i><div class="client-playlist-items" id="clientPlaylistItems"></div></div>`;

    setupClientBarsAutoHide(area);
    await renderClientPlaylistBar(device.id);
}

function setupClientBarsAutoHide(area) {
    clearTimeout(clientBarsTimer);
    clientBarsTimer = setTimeout(() => {
        const topbar = document.getElementById('clientTopbar'); const plbar = document.getElementById('clientPlaylistBar');
        if (topbar) topbar.classList.add('hidden-bar'); if (plbar) plbar.classList.add('hidden-bar');
    }, 3000);
    area.onmousemove = () => {
        const topbar = document.getElementById('clientTopbar'); const plbar = document.getElementById('clientPlaylistBar');
        if (topbar) topbar.classList.remove('hidden-bar'); if (plbar) plbar.classList.remove('hidden-bar');
        clearTimeout(clientBarsTimer);
        clientBarsTimer = setTimeout(() => { if (topbar) topbar.classList.add('hidden-bar'); if (plbar) plbar.classList.add('hidden-bar'); }, 3000);
    };
}

async function renderClientPlaylistBar(deviceId) {
    const playlist = await getPlaylist(deviceId);
    const contents = await getContents();
    const el = document.getElementById('clientPlaylistItems'); if (!el) return;
    if (!playlist || playlist.content_ids.length === 0) { el.innerHTML = '<span style="font-size:12px;color:#4a5568">Tidak ada playlist</span>'; return; }
    el.innerHTML = playlist.content_ids.map((cid, idx) => {
        const c = contents.find(x => x.id === cid); if (!c) return '';
        return `<div class="client-pl-item ${idx === clientPlaylistIndex ? 'active' : ''}">${esc(c.judul)}</div>`;
    }).join('');
}

async function startClientPlaylist(deviceId) {
    clearTimeout(clientPlaylistTimer);
    const playlist = await getPlaylist(deviceId);
    if (!playlist || playlist.content_ids.length <= 1) return;
    clientPlaylistTimer = setInterval(async () => {
        clientPlaylistIndex = (clientPlaylistIndex + 1) % playlist.content_ids.length;
        const contentId = playlist.content_ids[clientPlaylistIndex];
        const content = await getContent(contentId);
        const device = await getDevice(deviceId);
        if (content && device) {
            await setDeviceActiveContent(deviceId, contentId);
            await renderClientView(device, content);
        }
    }, 8000);
}

async function simulateConnect() {
    const deviceId = document.getElementById('clientDeviceSelect').value;
    if (!deviceId) { showToast('warning', 'Peringatan', 'Pilih device terlebih dahulu'); return; }
    await updateDeviceStatus(deviceId, 'online');
    await renderClientPage();
    const device = await getDevice(deviceId);
    if (device) await renderClientView(device, null);
    await startClientPlaylist(deviceId);
    showToast('success', 'Online', `Device "${device?.nama}" sekarang online`);
}

async function simulateDisconnect() {
    const deviceId = document.getElementById('clientDeviceSelect').value;
    if (!deviceId) { showToast('warning', 'Peringatan', 'Pilih device terlebih dahulu'); return; }
    await updateDeviceStatus(deviceId, 'offline');
    clearTimeout(clientPlaylistTimer);
    await renderClientPage();
    const device = await getDevice(deviceId);
    if (device) await renderClientView(device, null);
    showToast('warning', 'Offline', `Device "${device?.nama}" sekarang offline`);
}


// ============================================================
// 12. LOGS — Render
// ============================================================

async function renderLogs() {
    const logs = await getLogs();
    const el = document.getElementById('logEntriesFull');
    document.getElementById('logCount').textContent = `${logs.length} entri`;
    el.innerHTML = logs.length === 0
        ? '<div style="text-align:center;color:#4a5568;padding:40px">Belum ada log aktivitas</div>'
        : logs.map(logEntryHTML).join('');
}


// ============================================================
// 13. REAL-TIME LISTENER
// ============================================================

wsServer.on('status_change', async () => {
    switch (currentPage) {
        case 'dashboard': await renderDashboard(); break;
        case 'devices':   await renderDevices();   break;
        case 'clients':   await renderClientPage(); break;
        case 'logs':      await renderLogs();      break;
    }
});


// ============================================================
// 14. EVENT BINDING
// ============================================================

function bindEvents() {
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => { btn.addEventListener('click', () => navigateTo(btn.dataset.page)); });
    document.getElementById('mobileMenuBtn').addEventListener('click', toggleSidebar);
    document.getElementById('sidebarBackdrop').addEventListener('click', toggleSidebar);
    document.getElementById('refreshDashBtn').addEventListener('click', () => { renderDashboard(); showToast('info', 'Refreshed', 'Data dashboard telah diperbarui'); });
    
    document.getElementById('addDeviceBtn').addEventListener('click', () => openDeviceModal(null));
    document.getElementById('deviceSearch').addEventListener('input', renderDevices);
    document.getElementById('saveDeviceBtn').addEventListener('click', saveDevice);
    document.getElementById('playlistBtn').addEventListener('click', openPlaylistModal);
    
    document.getElementById('addContentBtn').addEventListener('click', () => openContentModal(null));
    document.getElementById('contentSearch').addEventListener('input', renderContents);
    document.getElementById('contentType').addEventListener('change', toggleContentPayload);
    document.getElementById('saveContentBtn').addEventListener('click', saveContent);
    
    document.getElementById('clientDeviceSelect').addEventListener('change', switchClientDevice);
    document.getElementById('simConnectBtn').addEventListener('click', simulateConnect);
    document.getElementById('simDisconnectBtn').addEventListener('click', simulateDisconnect);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
    document.getElementById('playlistDeviceSelect').addEventListener('change', loadPlaylistForDevice);

    document.querySelectorAll('[data-close]').forEach(btn => { btn.addEventListener('click', () => { document.getElementById(btn.dataset.close)?.classList.remove('active'); }); });
    document.querySelectorAll('.modal-overlay').forEach(overlay => { overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); }); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); });

    document.getElementById('deviceTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]'); if (!btn) return;
        if (btn.dataset.action === 'push') openPushModal(btn.dataset.id);
        if (btn.dataset.action === 'edit-device') openDeviceModal(btn.dataset.id);
        if (btn.dataset.action === 'delete-device') confirmDeleteDevice(btn.dataset.id);
    });

    document.getElementById('contentTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]'); if (!btn) return;
        if (btn.dataset.action === 'edit-content') openContentModal(btn.dataset.id);
        if (btn.dataset.action === 'delete-content') confirmDeleteContent(btn.dataset.id);
    });

    document.getElementById('pushContentList').addEventListener('click', (e) => {
        const item = e.target.closest('[data-action="do-push"]'); if (!item) return;
        pushContentToDevice(item.dataset.device, item.dataset.content);
    });

    document.getElementById('playlistAvailableContents').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="add-to-pl"]'); if (!btn) return;
        addToPlaylist(btn.dataset.device, btn.dataset.content);
    });

    document.getElementById('playlistCurrentItems').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="remove-from-pl"]'); if (!btn) return;
        removeFromPlaylist(btn.dataset.device, btn.dataset.content);
    });

    window.addEventListener('resize', handleResize);
}

function handleResize() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid) return;
    grid.style.gridTemplateColumns = window.innerWidth <= 900 ? '1fr' : '2fr 1fr';
}


// ============================================================
// 15. INISIALISASI APLIKASI
// ============================================================

async function initApp() {
    wsServer.connect(); // Hubungkan WebSocket ke Supabase Realtime
    handleResize();
    bindEvents();
    await navigateTo('dashboard');
}

checkAuth();

// Login button harus bisa diklik SEBELUM user berhasil login,
// jadi listener-nya didaftarkan langsung di sini, bukan menunggu initApp().
document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
