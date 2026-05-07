const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key';

async function supabaseRequest(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function getAll(table) {
  return await supabaseRequest(table);
}

async function insertRow(table, data) {
  return await supabaseRequest(table, 'POST', data);
}

async function updateRow(table, data, filters) {
  const params = filters.map(([k, v]) => `${k}=eq.${v}`).join('&');
  return await supabaseRequest(`${table}?${params}`, 'PATCH', data);
}

async function upsertRow(table, data) {
  return await supabaseRequest(table, 'POST', data);
}

async function deleteRow(table, filters) {
  const params = filters.map(([k, v]) => `${k}=eq.${v}`).join('&');
  return await supabaseRequest(`${table}?${params}`, 'DELETE');
}

async function loadDB() {
  const [users, keys, referrals] = await Promise.all([
    getAll('users'),
    getAll('keys'),
    getAll('referrals')
  ]);
  return {
    users: Array.isArray(users) ? users : [],
    keys: Array.isArray(keys) ? keys : [],
    referrals: Array.isArray(referrals) ? referrals : []
  };
}

async function saveUser(user, isNew = false) {
  if (isNew) {
    await supabaseRequest('users', 'POST', user);
  } else {
    await updateRow('users', user, [['username', user.username]]);
  }
}

async function saveKey(key, isNew = false) {
  if (isNew) {
    await supabaseRequest('keys', 'POST', key);
  } else {
    await updateRow('keys', key, [['id', key.id]]);
  }
}

async function saveReferral(ref, isNew = false) {
  if (isNew) {
    await supabaseRequest('referrals', 'POST', ref);
  } else {
    await updateRow('referrals', ref, [['code', ref.code]]);
  }
}

function generateUID() {
  return 'UID-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function generateKeyId() {
  return 'KEY-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function generateReferralCode() {
  return 'REF-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateKeyValue() {
  const gen = (len) => {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join('');
  };
  return gen(16) + '-' + gen(8) + '-' + gen(4);
}

function getBalanceForRole(role) {
  return { Reseller: 1000, Admin: 10000, Owner: 9999999 }[role] || 0;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization'
    }
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response('', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization'
      }
    });
  }

  try {
    const body = method === 'POST' || method === 'PATCH' ? await request.json() : {};

    if (path === 'login' && method === 'POST') {
      const { username, password } = body;
      const users = await getAll('users?username=eq.' + username);
      const user = users[0];
      if (!user) return jsonResponse({ success: false, error: 'Account does not exist' }, 404);
      if (user.banned) return jsonResponse({ success: false, error: 'Account does not exist' }, 403);
      if (user.password !== password) return jsonResponse({ success: false, error: 'Invalid credentials' }, 401);
      return jsonResponse({ success: true, user });
    }

    if (path === 'register' && method === 'POST') {
      const { username, password, referralCode } = body;
      const allUsers = await getAll('users?username=eq.' + username);
      if (allUsers.length > 0) {
        return jsonResponse({ success: false, error: 'Username already exists' }, 409);
      }
      const refs = await getAll('referrals?code=eq.' + referralCode?.toUpperCase());
      const referral = refs[0];
      if (!referral) return jsonResponse({ success: false, error: 'Invalid referral code' }, 400);
      if (referral.used) return jsonResponse({ success: false, error: 'Referral code already used' }, 400);

      const user = {
        uid: generateUID(),
        username,
        password,
        role: referral.role,
        referral_code: referralCode.toUpperCase(),
        balance: getBalanceForRole(referral.role),
        created_at: new Date().toISOString(),
        banned: false
      };
      await insertRow('users', user);
      await updateRow('referrals', { used: true, used_by: username, used_at: new Date().toISOString() }, [['code', referral.code]]);
      return jsonResponse({ success: true, user });
    }

    if (path === 'referrals' && method === 'POST') {
      const { code, role, ownerUid } = body;
      await insertRow('referrals', { code, role, owner_uid: ownerUid, used: false, created_at: new Date().toISOString() });
      return jsonResponse({ success: true });
    }

    if (path === 'referrals' && method === 'GET') {
      const data = await getAll('referrals');
      return jsonResponse(Array.isArray(data) ? data : []);
    }

    if (path === 'keys' && method === 'POST') {
      await insertRow('keys', body);
      return jsonResponse({ success: true, key: body });
    }

    if (path === 'keys/delete' && method === 'POST') {
      const { id } = body;
      await deleteRow('keys', [['id', id]]);
      return jsonResponse({ success: true });
    }

    if (path === 'keys/update' && method === 'POST') {
      const req = body;
      await updateRow('keys', req, [['id', req.id]]);
      return jsonResponse({ success: true });
    }

    if (path === 'activate' && method === 'POST') {
      const { key: keyValue, hwid, username } = body;
      const keys = await getAll('keys?value=eq.' + keyValue);
      const key = keys[0];
      if (!key) return jsonResponse({ success: false, error: 'Key not found' }, 404);
      if (key.frozen) return jsonResponse({ success: false, error: 'Key is frozen' }, 403);

      const expiresAt = key.expires_at ? new Date(key.expires_at) : null;
      if (expiresAt && expiresAt < new Date()) {
        return jsonResponse({ success: false, error: 'Key has expired' }, 403);
      }

      const current = key.current_activations || 0;
      const maxActs = key.max_activations || 1;
      if (current >= maxActs) {
        return jsonResponse({ success: false, error: `Max activations reached (${maxActs})` }, 403);
      }

      if (key.hwid && key.hwid !== hwid) {
        return jsonResponse({ success: false, error: `Key already activated on: ${key.hwid}` }, 403);
      }

      const duration = key.duration || 30;
      const expires = new Date();
      expires.setDate(expires.getDate() + duration);

      const updateData = {
        hwid,
        active: true,
        activated_by: username || 'Unknown',
        activated_at: new Date().toISOString(),
        expires_at: expires.toISOString(),
        current_activations: current + 1
      };
      await updateRow('keys', updateData, [['id', key.id]]);
      return jsonResponse({ success: true, key: key.name, duration, expiresAt: expires.toISOString() });
    }

    if (path.startsWith('activate/key=') && method === 'GET') {
      const keyValue = path.replace('activate/key=', '');
      const keys = await getAll('keys?value=eq.' + keyValue);
      const key = keys[0];
      if (!key) return jsonResponse({ exists: false });
      return jsonResponse({
        exists: true,
        active: key.active || false,
        frozen: key.frozen || false,
        hwid: key.hwid
      });
    }

    if (path === 'db' && method === 'GET') {
      const [users, keys, referrals] = await Promise.all([
        getAll('users'),
        getAll('keys'),
        getAll('referrals')
      ]);
      return jsonResponse({
        users: Array.isArray(users) ? users : [],
        keys: Array.isArray(keys) ? keys : [],
        referrals: Array.isArray(referrals) ? referrals : []
      });
    }

    if (path === 'db' && method === 'POST') {
      const { users, keys, referrals } = body;
      if (users) for (const u of users) await upsertRow('users', u);
      if (keys) for (const k of keys) await upsertRow('keys', k);
      if (referrals) for (const r of referrals) await upsertRow('referrals', r);
      return jsonResponse({ success: true });
    }

    if (path === 'init' && method === 'POST') {
      const existingUsers = await getAll('users');
      if (existingUsers.length > 0) {
        return jsonResponse({ success: true, message: 'Already initialized' });
      }
      await insertRow('users', {
        uid: 'UID-ADMIN001',
        username: 'admin',
        password: 'admin',
        role: 'Owner',
        balance: 9999999,
        created_at: new Date().toISOString()
      });
      await insertRow('referrals', { code: 'REF-INIT-OWNER', role: 'Owner', used: false, created_at: new Date().toISOString() });
      await insertRow('referrals', { code: 'REF-INIT-ADMIN', role: 'Admin', used: false, created_at: new Date().toISOString() });
      await insertRow('referrals', { code: 'REF-INIT-RESELLER', role: 'Reseller', used: false, created_at: new Date().toISOString() });
      return jsonResponse({ success: true, message: 'Database initialized' });
    }

    if (path === 'check-expiry' && method === 'GET') {
      const now = new Date();
      const keys = await getAll('keys?active=eq.true');
      const expiredIds = [];
      for (const k of keys) {
        const et = k.expires_at ? new Date(k.expires_at) : null;
        if (et && et < now) {
          expiredIds.push(k.id);
          await updateRow('keys', { active: false }, [['id', k.id]]);
        }
      }
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
