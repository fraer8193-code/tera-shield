const API_URL = (window.API_BASE || '') + '/api';

const Auth = {
    async api(method, endpoint, body) {
        try {
            const resp = await fetch(`${API_URL}${endpoint}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            });
            return await resp.json();
        } catch (e) {
            console.error('API error:', e);
            return { success: false, error: 'Cannot connect to server' };
        }
    },

    generateUID() {
        return 'UID-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    },

    generateKeyId() {
        return 'KEY-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    },

    generateReferralCode() {
        return 'REF-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    },

    generateKeyValue() {
        const gen = (len) => {
            const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return Array.from({length: len}, () => c[Math.floor(Math.random() * c.length)]).join('');
        };
        return gen(16) + '-' + gen(8) + '-' + gen(4);
    },

    getHWID() {
        const nav = navigator;
        const parts = [
            nav.userAgent,
            nav.platform || '',
            screen.width + 'x' + screen.height,
            nav.language,
            nav.hardwareConcurrency || 1
        ];
        let hash = 0;
        const str = parts.join('||');
        for (let i = 0; i < str.length; i++) {
            const chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        const deviceType = /Android/i.test(nav.userAgent) ? 'Android' : /iPhone|iPad/i.test(nav.userAgent) ? 'iOS' : 'PC';
        return 'HWID-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0') + '-' + deviceType;
    },

    async register(username, password, referralCode) {
        return await this.api('POST', '/register', { username, password, referralCode });
    },

    async login(username, password) {
        return await this.api('POST', '/login', { username, password });
    },

    setSession(user) { sessionStorage.setItem('current_user', JSON.stringify(user)); },
    getSession() { try { return JSON.parse(sessionStorage.getItem('current_user')); } catch { return null; } },
    clearSession() { sessionStorage.removeItem('current_user'); }
};
