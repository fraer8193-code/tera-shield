const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginMsg = document.getElementById('loginMsg');
const regMsg = document.getElementById('regMsg');
const toggleReg = document.getElementById('toggleReg');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const generatedCodeDisplay = document.getElementById('generatedCodeDisplay');
const generatedCodeText = document.getElementById('generatedCodeText');
const generatedCodeRole = document.getElementById('generatedCodeRole');

let isLoginVisible = true;

toggleReg.addEventListener('click', () => {
    isLoginVisible = !isLoginVisible;
    loginForm.classList.toggle('active', isLoginVisible);
    registerForm.classList.toggle('active', !isLoginVisible);
    toggleReg.textContent = isLoginVisible ? 'Need an account? Register' : 'Already have an account? Login';
    loginMsg.textContent = '';
    regMsg.textContent = '';
});

loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const result = await Auth.login(username, password);

    if (result.success) {
        loginMsg.className = 'msg success';
        loginMsg.textContent = 'Welcome back!';
        Auth.setSession(result.user);
        setTimeout(() => { window.location.href = 'admin.html'; }, 600);
    } else {
        loginMsg.className = 'msg error';
        loginMsg.textContent = result.error;
    }
});

registerForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;
    const referral = document.getElementById('regReferral').value.trim().toUpperCase();
    const rememberMe = document.getElementById('rememberMe').checked;

    if (!username || !password) { regMsg.className = 'msg error'; regMsg.textContent = 'Fill all fields'; return; }
    if (password !== confirm) { regMsg.className = 'msg error'; regMsg.textContent = 'Passwords do not match'; return; }
    if (!referral) { regMsg.className = 'msg error'; regMsg.textContent = 'Referral code is required'; return; }

    const result = await Auth.register(username, password, referral);
    if (result.success) {
        if (rememberMe) localStorage.setItem('remembered_user', username);
        else localStorage.removeItem('remembered_user');
        regMsg.className = 'msg success';
        regMsg.textContent = 'Registered! UID: ' + result.user.uid;
        registerForm.reset();
    } else {
        regMsg.className = 'msg error';
        regMsg.textContent = result.error;
    }
});

const rememberedUser = localStorage.getItem('remembered_user');
if (rememberedUser) document.getElementById('loginUsername').value = rememberedUser;

document.querySelectorAll('.role-select-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const role = btn.dataset.role;
        const code = Auth.generateReferralCode();
        const user = Auth.getSession();
        if (user) {
            await Auth.api('POST', '/referrals', { code, role, ownerUid: user.uid, ownerUsername: user.username });
        }
        generatedCodeText.textContent = code;
        generatedCodeRole.textContent = 'Role: ' + role;
        generatedCodeDisplay.style.display = 'block';
    });
});

modalClose.addEventListener('click', () => { modalOverlay.classList.remove('active'); generatedCodeDisplay.style.display = 'none'; });
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) { modalOverlay.classList.remove('active'); generatedCodeDisplay.style.display = 'none'; } });
