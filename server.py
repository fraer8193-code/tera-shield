import json
import os
import random
import string
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import hashlib
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='')
CORS(app)

DATA_FILE = 'data.json'

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return None

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_hwid():
    import platform
    import uuid
    parts = [platform.system(), platform.machine(), platform.processor(), str(uuid.getnode()), platform.node()]
    raw = '-'.join(parts).encode()
    hwid = hashlib.sha256(raw).hexdigest()[:16].upper()
    device_type = 'PC'
    if platform.system() == 'Windows':
        device_type = 'PC'
    return f'HWID-{hwid}-{device_type}'

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/admin.html')
def admin_page():
    return send_from_directory('.', 'admin.html')

@app.route('/api/db', methods=['GET'])
def get_db():
    data = load_data()
    if data is None:
        return jsonify({'error': 'No data'}), 404
    return jsonify(data)

@app.route('/api/db', methods=['POST'])
def update_db():
    data = request.json
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/keys', methods=['POST'])
def add_key():
    key_data = request.json
    data = load_data()
    if data is None:
        return jsonify({'error': 'No data'}), 404
    if 'keys' not in data:
        data['keys'] = []
    data['keys'].append(key_data)
    save_data(data)
    return jsonify({'success': True, 'key': key_data})

@app.route('/api/keys/delete', methods=['POST'])
def delete_key():
    req = request.json
    data = load_data()
    if data and 'keys' in data:
        data['keys'] = [k for k in data['keys'] if k.get('id') != req.get('id')]
        save_data(data)
    return jsonify({'success': True})

@app.route('/api/keys/update', methods=['POST'])
def update_key():
    req = request.json
    data = load_data()
    if data and 'keys' in data:
        for k in data['keys']:
            if k.get('id') == req.get('id'):
                k.update(req)
                break
        save_data(data)
    return jsonify({'success': True})

@app.route('/api/activate', methods=['POST'])
def activate_key():
    req = request.json
    key_value = req.get('key')
    hwid = req.get('hwid')

    data = load_data()
    if not data or 'keys' not in data:
        return jsonify({'success': False, 'error': 'Server error'}), 500

    key = None
    for k in data['keys']:
        if k.get('value') == key_value:
            key = k
            break

    if not key:
        return jsonify({'success': False, 'error': 'Key not found'}), 404

    if key.get('frozen'):
        return jsonify({'success': False, 'error': 'Key is frozen'}), 403

    expires_at = key.get('expiresAt')
    if expires_at and datetime.fromisoformat(expires_at) < datetime.now():
        return jsonify({'success': False, 'error': 'Key has expired'}), 403

    current = key.get('currentActivations', 0)
    max_acts = key.get('maxActivations', 1)

    if current >= max_acts:
        return jsonify({'success': False, 'error': f'Max activations reached ({max_acts})'}), 403

    if key.get('hwid') and key['hwid'] != hwid:
        return jsonify({'success': False, 'error': f'Key already activated on: {key["hwid"]}'}), 403

    key['hwid'] = hwid
    key['active'] = True
    key['activatedBy'] = req.get('username', 'Unknown')
    key['activatedAt'] = datetime.now().isoformat()
    key['expiresAt'] = (datetime.now() + timedelta(days=key.get('duration', 30))).isoformat()
    key['currentActivations'] = current + 1
    save_data(data)

    return jsonify({
        'success': True,
        'key': key['name'],
        'duration': key['duration'],
        'expiresAt': key['expiresAt']
    })

@app.route('/api/login', methods=['POST'])
def api_login():
    req = request.json
    username = req.get('username', '').strip()
    password = req.get('password', '')

    data = load_data()
    if not data or not data.get('users'):
        return jsonify({'success': False, 'error': 'Account does not exist'}), 404

    user = next((u for u in data['users'] if u.get('username') == username), None)
    if not user:
        return jsonify({'success': False, 'error': 'Account does not exist'}), 404
    if user.get('banned'):
        return jsonify({'success': False, 'error': 'Account does not exist'}), 403
    if user.get('password') != password:
        return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

    return jsonify({'success': True, 'user': user})

@app.route('/api/register', methods=['POST'])
def api_register():
    req = request.json
    username = req.get('username', '').strip()
    password = req.get('password', '')
    referral_code = req.get('referralCode', '').strip().upper()

    data = load_data()
    if not data:
        return jsonify({'success': False, 'error': 'Server error'}), 500

    if any(u.get('username') == username for u in data.get('users', [])):
        return jsonify({'success': False, 'error': 'Username already exists'}), 409

    referral = next((r for r in data.get('referrals', []) if r.get('code') == referral_code), None)
    if not referral:
        return jsonify({'success': False, 'error': 'Invalid referral code'}), 400
    if referral.get('used'):
        return jsonify({'success': False, 'error': 'Referral code already used'}), 400

    uid = 'UID-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    balance = {'Reseller': 1000, 'Admin': 10000, 'Owner': 9999999}.get(referral['role'], 0)
    user = {
        'uid': uid,
        'username': username,
        'password': password,
        'role': referral['role'],
        'referralCode': referral_code,
        'balance': balance,
        'createdAt': datetime.now().isoformat(),
        'banned': False
    }

    if 'users' not in data:
        data['users'] = []
    data['users'].append(user)

    for r in data['referrals']:
        if r.get('code') == referral_code:
            r['used'] = True
            r['usedBy'] = username
            r['usedAt'] = datetime.now().isoformat()
            break

    save_data(data)
    return jsonify({'success': True, 'user': user})

@app.route('/api/referrals', methods=['POST'])
def api_create_referral():
    req = request.json
    code = req.get('code')
    role = req.get('role')
    owner_username = req.get('ownerUsername')

    data = load_data()
    if not data:
        return jsonify({'success': False, 'error': 'Server error'}), 500

    if 'referrals' not in data:
        data['referrals'] = []
    data['referrals'].append({
        'code': code,
        'role': role,
        'ownerUid': req.get('ownerUid', ''),
        'used': False,
        'createdAt': datetime.now().isoformat()
    })
    save_data(data)
    return jsonify({'success': True})

@app.route('/api/referrals', methods=['GET'])
def api_get_referrals():
    data = load_data()
    return jsonify(data.get('referrals', []) if data else [])

@app.route('/api/check-expiry', methods=['GET'])
def check_expiry():
    data = load_data()
    if not data or not data.get('keys'):
        return jsonify({'expired': False})
    expired_ids = []
    now = datetime.now()
    for k in data['keys']:
        et = k.get('expiresAt')
        if et and k.get('active') and datetime.fromisoformat(et) < now:
            expired_ids.append(k.get('id'))
            k['active'] = False
    if expired_ids:
        save_data(data)
    return jsonify({'expired': expired_ids})

@app.route('/api/activate/key=<key>', methods=['GET'])
def check_key(key):
    data = load_data()
    if not data or 'keys' not in data:
        return jsonify({'exists': False})
    for k in data['keys']:
        if k.get('value') == key:
            return jsonify({
                'exists': True,
                'active': k.get('active', False),
                'frozen': k.get('frozen', False),
                'hwid': k.get('hwid')
            })
    return jsonify({'exists': False})

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('js', filename)

if __name__ == '__main__':
    if not os.path.exists(DATA_FILE):
        save_data({
            'keys': [],
            'users': [{
                'uid': 'UID-ADMIN001',
                'username': 'admin',
                'password': 'admin',
                'role': 'Owner',
                'balance': 9999999
            }],
            'referrals': [
                {'code': 'REF-INIT-OWNER', 'role': 'Owner', 'used': False},
                {'code': 'REF-INIT-ADMIN', 'role': 'Admin', 'used': False},
                {'code': 'REF-INIT-RESELLER', 'role': 'Reseller', 'used': False}
            ]
        })

    print('[TeraShield] Server starting on http://localhost:5000')
    app.run(host='0.0.0.0', port=5000, debug=True)
