-- TeraShield Database Schema for Beget (MySQL)

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Owner', 'Admin', 'Reseller') NOT NULL,
    balance INT DEFAULT 0,
    referral_code VARCHAR(50),
    banned TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_id VARCHAR(20) UNIQUE NOT NULL,
    key_value VARCHAR(100) UNIQUE NOT NULL,
    key_name VARCHAR(100),
    hwid VARCHAR(100),
    active TINYINT(1) DEFAULT 0,
    frozen TINYINT(1) DEFAULT 0,
    duration INT DEFAULT 30,
    max_activations INT DEFAULT 1,
    current_activations INT DEFAULT 0,
    price INT DEFAULT 0,
    owner_uid VARCHAR(20),
    owner_username VARCHAR(50),
    activated_by VARCHAR(50),
    activated_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    role ENUM('Owner', 'Admin', 'Reseller') NOT NULL,
    owner_uid VARCHAR(20),
    used TINYINT(1) DEFAULT 0,
    used_by VARCHAR(50),
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_keys_value ON keys(key_value);
CREATE INDEX idx_keys_active ON keys(active);
CREATE INDEX idx_referrals_code ON referrals(code);

-- Initialize default admin and referral codes
INSERT INTO users (uid, username, password_hash, role, balance) VALUES
('UID-ADMIN001', 'admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Owner', 9999999);

INSERT INTO referrals (code, role) VALUES
('REF-INIT-OWNER', 'Owner'),
('REF-INIT-ADMIN', 'Admin'),
('REF-INIT-RESELLER', 'Reseller');
