if (typeof API_URL === 'undefined') {
    const API_URL = (window.API_BASE || '') + '/api.php';
}
if (typeof Auth === 'undefined') {
    const Auth = {
        api(method, endpoint, body) {
            return fetch(`${API_URL}?action=${endpoint}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            }).then(r => r.json()).catch(() => null);
        },
        getSession() { try { return JSON.parse(sessionStorage.getItem('current_user')); } catch { return null; } },
        setSession(u) { sessionStorage.setItem('current_user', JSON.stringify(u)); },
        clearSession() { sessionStorage.removeItem('current_user'); }
    };
}

const currentUser = Auth.getSession();
if (!currentUser || currentUser.banned) { window.location.href = 'index.html'; }

let notificationsEnabled = true;

function isNotificationsEnabled() {
    return localStorage.getItem('notifications') !== 'disabled';
}

function showToast(message, type = 'info') {
    if (!isNotificationsEnabled()) return;
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="#2e86c1" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function toggleNotifications(el) {
    el.classList.toggle('active');
    notificationsEnabled = el.classList.contains('active');
    localStorage.setItem('notifications', notificationsEnabled ? 'enabled' : 'disabled');
}

async function api(method, endpoint, body) {
    try {
        const resp = await fetch(`${API_URL}?action=${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        return await resp.json();
    } catch (e) {
        console.error('API error:', e);
        return null;
    }
}

async function refreshUser() {
    const data = await api('GET', 'db');
    const user = data && data.users ? data.users.find(u => u.username === currentUser.username) : null;
    if (!user) { window.location.href = 'index.html'; return null; }
    if (user.banned) { window.location.href = 'index.html'; return null; }
    Object.assign(currentUser, user);
    Auth.setSession(currentUser);
    return user;
}

const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.panel-section');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(item.dataset.section).classList.add('active');
    });
});

document.getElementById('logoutBtn').addEventListener('click', () => { Auth.clearSession(); window.location.href = 'index.html'; });

document.getElementById('themeToggle').addEventListener('click', () => { alert('Light theme is active by default'); });

const refModal = document.getElementById('refModal');
const refResult = document.getElementById('refResult');

document.getElementById('openRefModalBtn').addEventListener('click', () => { refModal.style.display = 'flex'; refResult.style.display = 'none'; });
document.getElementById('closeRefModal').addEventListener('click', () => { refModal.style.display = 'none'; });
refModal.addEventListener('click', (e) => { if (e.target === refModal) refModal.style.display = 'none'; });

document.querySelectorAll('.ref-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const role = btn.dataset.role;
        const code = Auth.generateReferralCode();
        const user = await refreshUser();
        const data = await api('GET', '/db');
        if (data) {
            if (!data.referrals) data.referrals = [];
            data.referrals.push({ code, role, ownerUid: user.uid, used: false });
            await api('POST', '/db', data);
        }
        document.getElementById('refResultCode').textContent = code;
        document.getElementById('refResultRole').textContent = 'Role: ' + role;
        refResult.style.display = 'block';
        showToast('Referral code generated: ' + code + ' (' + role + ')', 'success');
        document.getElementById('lastGeneratedCode').textContent = code;
        document.getElementById('referralDisplay').style.display = 'block';
        await renderReferrals();
        await updateStats();
    });
});

document.getElementById('copyLastRefBtn').addEventListener('click', function() {
    const code = document.getElementById('lastGeneratedCode').textContent;
    if (code) { navigator.clipboard.writeText(code); this.textContent = 'Copied!'; showToast('Referral code copied!', 'success'); setTimeout(() => { this.textContent = 'Copy'; }, 1500); }
});

let inputModalCallback = null;
const inputModal = document.getElementById('inputModal');
const inputModalValue = document.getElementById('inputModalValue');

function showInputModal(title, defaultVal, callback) {
    document.getElementById('inputModalTitle').textContent = title;
    inputModalValue.value = defaultVal || '';
    inputModal.classList.add('active');
    inputModalCallback = callback;
    setTimeout(() => inputModalValue.focus(), 100);
}

document.getElementById('inputModalConfirm').addEventListener('click', () => {
    const val = parseInt(inputModalValue.value);
    if (!isNaN(val) && val > 0 && inputModalCallback) inputModalCallback(val);
    inputModal.classList.remove('active');
});

document.getElementById('inputModalCancel').addEventListener('click', () => { inputModal.classList.remove('active'); });
inputModal.addEventListener('click', (e) => { if (e.target === inputModal) inputModal.classList.remove('active'); });

const PRICES = { '7': 50, '15': 200, '30': 500 };

document.getElementById('customKeyCheck').addEventListener('change', function() {
    document.getElementById('customKeyValue').classList.toggle('visible', this.checked);
});

document.getElementById('generateKeyBtn').addEventListener('click', async () => {
    const user = await refreshUser();
    const duration = document.getElementById('keyDuration').value;
    const price = PRICES[duration];
    const activations = parseInt(document.getElementById('keyActivations').value) || 1;
    const isCustom = document.getElementById('customKeyCheck').checked;
    const customName = document.getElementById('customKeyValue').value.trim();
    const msg = document.getElementById('keyMsg');

    if (user.balance < price) { msg.className = 'msg error'; msg.textContent = 'Insufficient balance. Need $' + price; return; }

    const name = isCustom ? (customName || 'Key_' + Auth.generateKeyValue().substring(0, 8)) : 'Key_' + Auth.generateKeyValue().substring(0, 8);

    const keyData = {
        id: Auth.generateKeyId(),
        name, value: Auth.generateKeyValue(),
        duration: parseInt(duration), maxActivations: activations, currentActivations: 0,
        ownerUid: user.uid, ownerUsername: user.username,
        price, createdAt: new Date().toISOString(),
        frozen: false, hwid: null, activatedBy: null, active: false
    };

    const result = await api('POST', '/keys', keyData);
    if (result && result.success) {
        user.balance -= price;
        const data = await api('GET', '/db');
        if (data) {
            const dbUser = data.users.find(u => u.username === user.username);
            if (dbUser) dbUser.balance = user.balance;
            await api('POST', '/db', data);
        }
        msg.className = 'msg success';
        msg.textContent = 'Key generated! -$' + price + ' (Balance: $' + user.balance.toLocaleString() + ')';
        showToast('Key generated: ' + name + ' (-$' + price + ')', 'success');
        document.getElementById('userBalance').textContent = user.balance.toLocaleString();
        if (isCustom) document.getElementById('customKeyValue').value = '';
        document.getElementById('keyActivations').value = '';
        await renderKeys();
        await renderActiveKeys();
        await updateStats();
    }
});

function getDurationBadge(d) {
    const cls = { 7: 'badge-7d', 15: 'badge-15d', 30: 'badge-30d' };
    const lbl = { 7: '7D', 15: '15D', 30: '30D' };
    return `<span class="key-badge ${cls[d]}">${lbl[d]}</span>`;
}

function getHwidType(hwid) {
    if (!hwid) return 'Unknown';
    if (hwid.includes('Android')) return 'Android';
    if (hwid.includes('iOS')) return 'iOS';
    return 'PC';
}

async function renderKeys() {
    const user = await refreshUser();
    const data = await api('GET', '/db');
    const allKeys = data && data.keys ? data.keys : [];
    const myKeys = allKeys.filter(k => k.ownerUid === user.uid);
    const container = document.getElementById('keysList');

    if (myKeys.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No keys generated yet</p></div>`;
        return;
    }

    container.innerHTML = myKeys.map(key => `
        <div class="key-item">
            <div class="key-info">
                <span class="key-name">${key.name}</span>
                <span class="key-value blurred" onclick="this.classList.toggle('blurred')">${key.value}</span>
            </div>
            <div class="key-actions">
                <span class="key-price">-$${key.price}</span>
                ${getDurationBadge(key.duration)}
                <span class="key-acts">${key.currentActivations}/${key.maxActivations} acts</span>
                <div class="btn-icon" onclick="navigator.clipboard.writeText('${key.value}')" title="Copy">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </div>
                <div class="btn-icon delete" onclick="deleteKey('${key.id}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </div>
            </div>
        </div>
    `).join('');
}

async function deleteKey(id) {
    await api('POST', '/keys/delete', { id });
    await renderKeys();
    await renderActiveKeys();
    await updateStats();
}

async function renderActiveKeys() {
    const data = await api('GET', '/db');
    const activeKeys = (data && data.keys ? data.keys : []).filter(k => k.active);
    const container = document.getElementById('activeKeysList');

    if (activeKeys.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No active keys</p></div>`;
        return;
    }

    container.innerHTML = activeKeys.map(key => `
        <div class="active-key-item">
            <div class="active-key-header">
                <div>
                    <div class="active-key-name">${key.name} ${key.frozen ? '<span class="status-badge status-frozen">FROZEN</span>' : '<span class="status-badge status-active">ACTIVE</span>'}</div>
                    <div class="active-key-user">${key.activatedBy || 'Unknown'}</div>
                </div>
            </div>
            <div class="active-key-info">
                <div class="hwid-badge">${getHwidType(key.hwid)} ${key.hwid || 'No HWID'}</div>
                <div class="active-key-stat">${key.currentActivations}/${key.maxActivations} activations</div>
                <div class="active-key-stat">${key.duration} days</div>
            </div>
            <div class="active-key-actions">
                ${key.frozen
                    ? `<button class="btn-action btn-unfreeze" onclick="unfreezeKey('${key.id}')">Unfreeze</button>`
                    : `<button class="btn-action btn-freeze" onclick="freezeKey('${key.id}')">Freeze</button>`
                }
                <button class="btn-action btn-reset-hwid" onclick="resetHwid('${key.id}')">Reset HWID</button>
                <button class="btn-action btn-add-days" onclick="addDays('${key.id}')">Add Days</button>
                <button class="btn-action btn-add-acts" onclick="addActivations('${key.id}')">Add Acts</button>
            </div>
        </div>
    `).join('');
}

async function freezeKey(id) { await api('POST', '/keys/update', { id, frozen: true }); await renderActiveKeys(); }
async function unfreezeKey(id) { await api('POST', '/keys/update', { id, frozen: false }); await renderActiveKeys(); }
async function resetHwid(id) { await api('POST', '/keys/update', { id, hwid: null, activatedBy: null, active: false, currentActivations: 0 }); await renderActiveKeys(); await updateStats(); }

async function addDays(id) {
    showInputModal('Add days to key', '7', async (val) => {
        const data = await api('GET', '/db');
        if (data && data.keys) {
            const key = data.keys.find(k => k.id === id);
            if (key) { key.duration = (key.duration || 0) + val; await api('POST', '/db', data); }
        }
        await renderActiveKeys();
        await renderKeys();
    });
}

async function addActivations(id) {
    showInputModal('Add activations to key', '1', async (val) => {
        const data = await api('GET', '/db');
        if (data && data.keys) {
            const key = data.keys.find(k => k.id === id);
            if (key) { key.maxActivations = (key.maxActivations || 1) + val; await api('POST', '/db', data); }
        }
        await renderActiveKeys();
        await renderKeys();
    });
}

async function renderReferrals() {
    const user = await refreshUser();
    const data = await api('GET', '/db');
    const myRefs = (data && data.referrals ? data.referrals : []).filter(r => r.ownerUid === user.uid);
    document.getElementById('statReferrals').textContent = myRefs.length;

    if (myRefs.length > 0) {
        document.getElementById('lastGeneratedCode').textContent = myRefs[myRefs.length - 1].code;
        document.getElementById('referralDisplay').style.display = 'block';
    }

    const container = document.getElementById('referralsList');
    if (myRefs.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No referral codes</p></div>`;
        return;
    }

    container.innerHTML = myRefs.map(ref => `
        <div class="referral-item">
            <span>${ref.code} -> ${ref.role}${ref.used ? ' (Used)' : ''}</span>
            <small>${new Date(ref.createdAt).toLocaleDateString()}</small>
            <div class="btn-icon" onclick="navigator.clipboard.writeText('${ref.code}')" title="Copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </div>
        </div>
    `).join('');
}

async function updateStats() {
    const user = await refreshUser();
    const data = await api('GET', '/db');
    const allKeys = data && data.keys ? data.keys : [];
    const myKeys = allKeys.filter(k => k.ownerUid === user.uid);
    const activeCount = allKeys.filter(k => k.active).length;

    document.getElementById('statTotalKeys').textContent = allKeys.length;
    document.getElementById('statActiveKeys').textContent = activeCount;
    document.getElementById('statMyKeys').textContent = myKeys.length;
}

async function renderUsers() {
    const data = await api('GET', '/db');
    const users = (data && data.users) || [];
    const container = document.getElementById('usersList');

    if (users.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No users yet</p></div>`;
        return;
    }

    container.innerHTML = users.map(user => {
        const isMe = user.username === currentUser.username;
        return `
            <div class="user-item" onclick="showUserDetail('${user.username}')">
                <div class="user-item-info">
                    <span class="user-item-name">${user.username}${isMe ? ' (You)' : ''} <span class="user-role-badge role-${(user.role || '').toLowerCase()}">${user.role || 'Unknown'}</span></span>
                    <span class="user-item-uid">${user.uid || ''}</span>
                </div>
                <div class="user-item-actions">
                    <span class="user-balance-inline">$${(user.balance || 0).toLocaleString()}</span>
                </div>
            </div>`;
    }).join('');
}

async function showUserDetail(username) {
    const data = await api('GET', '/db');
    const user = data && data.users ? data.users.find(u => u.username === username) : null;
    if (!user) return;

    const panel = document.getElementById('userDetailPanel');
    const isBanned = user.banned;
    const safeId = username.replace(/[^a-zA-Z0-9]/g, '');
    const userKeys = (data && data.keys ? data.keys : []).filter(k => k.ownerUid === user.uid);
    const userRefs = (data && data.referrals ? data.referrals : []).filter(r => r.ownerUid === user.uid);

    panel.innerHTML = `
        <div class="user-detail-header">
            <div class="user-detail-avatar avatar-${(user.role || '').toLowerCase()}">${user.username[0].toUpperCase()}</div>
            <div class="user-detail-info">
                <h4>${user.username}</h4>
                <span class="user-role-badge role-${(user.role || '').toLowerCase()}">${user.role || 'Unknown'}</span>
            </div>
        </div>
        <div class="user-detail-stats">
            <div class="user-detail-stat"><div class="user-detail-stat-value">$${(user.balance || 0).toLocaleString()}</div><div class="user-detail-stat-label">Balance</div></div>
            <div class="user-detail-stat"><div class="user-detail-stat-value">${userKeys.length}</div><div class="user-detail-stat-label">Keys</div></div>
            <div class="user-detail-stat"><div class="user-detail-stat-value">${userRefs.length}</div><div class="user-detail-stat-label">Referrals</div></div>
        </div>
        <div class="user-detail-uid">${user.uid || ''}</div>
        <div class="user-detail-actions">
            ${isBanned
                ? `<button class="btn-sm btn-unban" onclick="unbanUser('${user.username}')">Unban</button>`
                : `<button class="btn-sm btn-ban" onclick="banUser('${user.username}')">Ban</button>`
            }
            <div class="balance-input">
                <input type="number" id="balInput_${safeId}" placeholder="$ Amount">
                <button class="btn-set-balance" onclick="setBalance('${user.username}', '${safeId}')">Set</button>
            </div>
        </div>`;

    panel.classList.add('active');
}

async function banUser(username) {
    const data = await api('GET', '/db');
    if (data && data.users) {
        const user = data.users.find(u => u.username === username);
        if (user) user.banned = true;
        await api('POST', '/db', data);
    }
    await renderUsers();
    document.getElementById('userDetailPanel').classList.remove('active');
}

async function unbanUser(username) {
    const data = await api('GET', '/db');
    if (data && data.users) {
        const user = data.users.find(u => u.username === username);
        if (user) user.banned = false;
        await api('POST', '/db', data);
    }
    await renderUsers();
    document.getElementById('userDetailPanel').classList.remove('active');
}

async function setBalance(username, safeId) {
    const input = document.getElementById('balInput_' + safeId);
    const amount = parseInt(input.value);
    if (isNaN(amount) || amount < 0) return;
    const data = await api('GET', '/db');
    if (data && data.users) {
        const user = data.users.find(u => u.username === username);
        if (user) user.balance = amount;
        await api('POST', '/db', data);
    }
    input.value = '';
    await renderUsers();
    await showUserDetail(username);
    await refreshUser();
    document.getElementById('userBalance').textContent = currentUser.balance.toLocaleString();
}

async function setupUI() {
    notificationsEnabled = localStorage.getItem('notifications') !== 'disabled';
    const notifToggle = document.getElementById('notificationsToggle');
    if (notifToggle) {
        notifToggle.classList.toggle('active', notificationsEnabled);
    }

    const data = await api('GET', '/db');
    const user = await refreshUser();
    if (!user) return;

    const roleBadge = document.getElementById('userRoleBadge');
    roleBadge.textContent = user.role.toUpperCase();
    roleBadge.className = 'user-role-badge role-' + user.role.toLowerCase();

    document.getElementById('userBalance').textContent = user.balance.toLocaleString();
    document.getElementById('userUid').textContent = user.uid;
    document.getElementById('settingsUsername').textContent = user.username;
    document.getElementById('settingsRole').textContent = user.role;
    document.getElementById('settingsUid').textContent = user.uid;

    if (user.role === 'Admin' || user.role === 'Owner') {
        document.querySelector('.admin-only').style.display = 'flex';
        document.body.classList.add('show-admin');
    }

    await renderKeys();
    await renderActiveKeys();
    await renderReferrals();
    await updateStats();
    if (user.role === 'Admin' || user.role === 'Owner') await renderUsers();
}

setupUI();
