const crypto = require('crypto');

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function now() {
  return new Date();
}

function nowIso() {
  return now().toISOString();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function isExpired(isoString) {
  return new Date(isoString).getTime() < Date.now();
}

function generateToken(size = 32) {
  return crypto.randomBytes(size).toString('hex');
}

module.exports = {
  hashValue,
  generateOtpCode,
  now,
  nowIso,
  addMinutes,
  addHours,
  isExpired,
  generateToken
};
