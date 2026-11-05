#!/usr/bin/env node
// Код Steam Guard (5 символов) из shared_secret мобильного аутентификатора — для входа steamcmd в CI.
// Секрет берётся только из переменной окружения STEAM_TOTP_SECRET (base64), в репозитории его нет.
import { createHmac } from 'node:crypto';

const secret = process.env.STEAM_TOTP_SECRET;
if (!secret) {
  console.error('guard-code: нет STEAM_TOTP_SECRET');
  process.exit(1);
}
const ALPHABET = '23456789BCDFGHJKMNPQRTVWXY';
const counter = Buffer.alloc(8);
counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
const h = createHmac('sha1', Buffer.from(secret, 'base64')).update(counter).digest();
const o = h[19] & 0x0f;
let n = h.readUInt32BE(o) & 0x7fffffff;
let code = '';
for (let i = 0; i < 5; i++) {
  code += ALPHABET[n % ALPHABET.length];
  n = Math.floor(n / ALPHABET.length);
}
process.stdout.write(code);
