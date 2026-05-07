const DB = {
    _get(key) {
        try { return JSON.parse(localStorage.getItem(key)) || null; }
        catch { return null; }
    },
    _set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    getUsers() { return this._get('users') || []; },
    setUsers(u) { this._set('users', u); },
    getKeys() { return this._get('keys') || []; },
    setKeys(k) { this._set('keys', k); },
    getReferrals() { return this._get('referrals') || []; },
    setReferrals(r) { this._set('referrals', r); },
    getBanned() { return this._get('banned') || []; },
    setBanned(b) { this._set('banned', b); },
    getSettings() { return this._get('settings') || {}; },
    setSettings(s) { this._set('settings', s); },

    findUser(username) { return this.getUsers().find(u => u.username === username); },

    addUser(username, password, role, referralCode, uid) {
        const users = this.getUsers();
        users.push({
            uid, username, password, role, referralCode,
            balance: role === 'Reseller' ? 1000 : role === 'Admin' ? 10000 : 9999999,
            createdAt: new Date().toISOString(), banned: false
        });
        this.setUsers(users);
        return users[users.length - 1];
    },

    addKey(keyData) {
        const keys = this.getKeys();
        keys.push({ ...keyData, currentActivations: 0, maxActivations: 1 });
        this.setKeys(keys);
    },

    updateKey(keyId, updates) {
        const keys = this.getKeys();
        const key = keys.find(k => k.id === keyId);
        if (key) Object.assign(key, updates);
        this.setKeys(keys);
    },

    addReferral(code, role, ownerUid) {
        const refs = this.getReferrals();
        refs.push({ code, role, ownerUid, used: false, createdAt: new Date().toISOString() });
        this.setReferrals(refs);
    },

    useReferral(code) {
        const refs = this.getReferrals();
        const ref = refs.find(r => r.code === code);
        if (ref) ref.used = true;
        this.setReferrals(refs);
    },

    updateBalance(username, amount) {
        const users = this.getUsers();
        const user = users.find(u => u.username === username);
        if (user) { user.balance = amount; this.setUsers(users); }
    },

    banUser(username) {
        const users = this.getUsers();
        const user = users.find(u => u.username === username);
        if (user) { user.banned = true; this.setUsers(users); }
    },

    unbanUser(username) {
        const users = this.getUsers();
        const user = users.find(u => u.username === username);
        if (user) { user.banned = false; this.setUsers(users); }
    }
};
