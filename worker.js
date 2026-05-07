const GIST_ID = '17f0c0b5120344c1415eceedd5730d57';
const GIST_FILE = 'database.json';

function getGistToken() {
  return typeof GIST_TOKEN !== 'undefined' ? GIST_TOKEN : '';
}

async function loadDB() {
  const token = getGistToken();
  const resp = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json'
    }
  });
  const data = await resp.json();
  const content = data.files[GIST_FILE]?.content;
  if (!content) return { users: [], keys: [], referrals: [] };
  try { return JSON.parse(content); } catch { return { users: [], keys: [], referrals: [] }; }
}

async function saveDB(data) {
  const token = getGistToken();
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': 'token ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json'
    },
    body: JSON.stringify({ description: 'TeraShield Database', public: false, files: { [GIST_FILE]: { content: JSON.stringify(data) } } })
  });
}

function generateUID() { return 'UID-' + Math.random().toString(36).substring(2, 10).toUpperCase(); }
function generateKeyId() { return 'KEY-' + Math.random().toString(36).substring(2, 10).toUpperCase(); }
function generateReferralCode() { return 'REF-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(); }
function generateKeyValue() {
  const gen = (len) => Array.from({ length: len }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
  return gen(16) + '-' + gen(8) + '-' + gen(4);
}
function getBalanceForRole(role) { return { Reseller: 1000, Admin: 10000, Owner: 9999999 }[role] || 0; }

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response('', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    });
  }

  try {
    const body = method === 'POST' || method === 'PATCH' ? await request.json() : {};

    if (path === 'login' && method === 'POST') {
      const { username, password } = body;
      const data = await loadDB();
      const user = data.users.find(u => u.username === username);
      if (!user) return jsonResponse({ success: false, error: 'Account does not exist' }, 404);
      if (user.banned) return jsonResponse({ success: false, error: 'Account does not exist' }, 403);
      if (user.password !== password) return jsonResponse({ success: false, error: 'Invalid credentials' }, 401);
      return jsonResponse({ success: true, user });
    }

    if (path === 'register' && method === 'POST') {
      const { username, password, referralCode } = body;
      const data = await loadDB();
      if (data.users.some(u => u.username === username)) return jsonResponse({ success: false, error: 'Username already exists' }, 409);
      const referral = data.referrals.find(r => r.code === referralCode?.toUpperCase());
      if (!referral) return jsonResponse({ success: false, error: 'Invalid referral code' }, 400);
      if (referral.used) return jsonResponse({ success: false, error: 'Referral code already used' }, 400);
      const user = { uid: generateUID(), username, password, role: referral.role, referralCode: referralCode.toUpperCase(), balance: getBalanceForRole(referral.role), createdAt: new Date().toISOString(), banned: false };
      data.users.push(user);
      referral.used = true;
      referral.usedBy = username;
      referral.usedAt = new Date().toISOString();
      await saveDB(data);
      return jsonResponse({ success: true, user });
    }

    if (path === 'referrals' && method === 'POST') {
      const { code, role, ownerUid } = body;
      const data = await loadDB();
      data.referrals.push({ code, role, ownerUid, used: false, createdAt: new Date().toISOString() });
      await saveDB(data);
      return jsonResponse({ success: true });
    }

    if (path === 'referrals' && method === 'GET') {
      return jsonResponse((await loadDB()).referrals);
    }

    if (path === 'keys' && method === 'POST') {
      const data = await loadDB();
      data.keys.push(body);
      await saveDB(data);
      return jsonResponse({ success: true, key: body });
    }

    if (path === 'keys/delete' && method === 'POST') {
      const data = await loadDB();
      data.keys = data.keys.filter(k => k.id !== body.id);
      await saveDB(data);
      return jsonResponse({ success: true });
    }

    if (path === 'keys/update' && method === 'POST') {
      const data = await loadDB();
      const idx = data.keys.findIndex(k => k.id === body.id);
      if (idx !== -1) data.keys[idx] = { ...data.keys[idx], ...body };
      await saveDB(data);
      return jsonResponse({ success: true });
    }

    if (path === 'activate' && method === 'POST') {
      const { key: keyValue, hwid, username } = body;
      const data = await loadDB();
      const key = data.keys.find(k => k.value === keyValue);
      if (!key) return jsonResponse({ success: false, error: 'Key not found' }, 404);
      if (key.frozen) return jsonResponse({ success: false, error: 'Key is frozen' }, 403);
      const expiresAt = key.expiresAt ? new Date(key.expiresAt) : null;
      if (expiresAt && expiresAt < new Date()) return jsonResponse({ success: false, error: 'Key has expired' }, 403);
      const current = key.currentActivations || 0;
      if (current >= (key.maxActivations || 1)) return jsonResponse({ success: false, error: `Max activations reached` }, 403);
      if (key.hwid && key.hwid !== hwid) return jsonResponse({ success: false, error: `Key already activated on: ${key.hwid}` }, 403);
      const duration = key.duration || 30;
      const expires = new Date();
      expires.setDate(expires.getDate() + duration);
      key.hwid = hwid;
      key.active = true;
      key.activatedBy = username || 'Unknown';
      key.activatedAt = new Date().toISOString();
      key.expiresAt = expires.toISOString();
      key.currentActivations = current + 1;
      await saveDB(data);
      return jsonResponse({ success: true, key: key.name, duration, expiresAt: key.expiresAt });
    }

    if (path.startsWith('activate/key=') && method === 'GET') {
      const keyValue = path.replace('activate/key=', '');
      const data = await loadDB();
      const key = data.keys.find(k => k.value === keyValue);
      if (!key) return jsonResponse({ exists: false });
      return jsonResponse({ exists: true, active: key.active || false, frozen: key.frozen || false, hwid: key.hwid });
    }

    if (path === 'db' && method === 'GET') return jsonResponse(await loadDB());

    if (path === 'db' && method === 'POST') {
      await saveDB(body);
      return jsonResponse({ success: true });
    }

    if (path === 'init' && method === 'POST') {
      const data = await loadDB();
      if (data.users.length > 0) return jsonResponse({ success: true, message: 'Already initialized' });
      data.users = [{ uid: 'UID-ADMIN001', username: 'admin', password: 'admin', role: 'Owner', balance: 9999999 }];
      data.referrals = [
        { code: 'REF-INIT-OWNER', role: 'Owner', used: false, createdAt: new Date().toISOString() },
        { code: 'REF-INIT-ADMIN', role: 'Admin', used: false, createdAt: new Date().toISOString() },
        { code: 'REF-INIT-RESELLER', role: 'Reseller', used: false, createdAt: new Date().toISOString() }
      ];
      data.keys = [];
      await saveDB(data);
      return jsonResponse({ success: true, message: 'Database initialized' });
    }

    if (path === 'check-expiry' && method === 'GET') {
      const data = await loadDB();
      const now = new Date();
      const expiredIds = [];
      for (const k of data.keys) {
        const et = k.expiresAt ? new Date(k.expiresAt) : null;
        if (et && k.active && et < now) {
          expiredIds.push(k.id);
          k.active = false;
        }
      }
      if (expiredIds.length) await saveDB(data);
      return jsonResponse({ expired: expiredIds });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
