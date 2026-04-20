/**
 * _crypto.js  —  세션 토큰 암호화/복호화 유틸리티
 *
 * 세션 토큰 = AES-256-GCM 암호화(JSON{ key, exp })의 hex 문자열
 * → 서버 메모리/DB 불필요, Vercel 서버리스 인스턴스 간 공유 문제 없음
 * → 클라이언트는 복호화 불가 (SECRET_KEY 없이는 읽을 수 없음)
 *
 * Vercel 환경변수:
 *   SESSION_SECRET  —  32바이트 이상의 임의 문자열 (필수)
 *                      예: openssl rand -hex 32
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const TTL_MS = 4 * 60 * 60 * 1000; // 4시간

function getSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다.');
  // 길이에 관계없이 sha256으로 32바이트 키 생성
  return crypto.createHash('sha256').update(s).digest();
}

/**
 * API 키를 암호화해 세션 토큰(hex string) 반환
 */
export function encrypt(apiKey) {
  const secret = getSecret();
  const iv = crypto.randomBytes(12); // GCM 표준 12바이트
  const payload = JSON.stringify({ key: apiKey, exp: Date.now() + TTL_MS });

  const cipher = crypto.createCipheriv(ALGO, secret, iv);
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // iv(12) + tag(16) + enc 를 hex로 직렬화
  return Buffer.concat([iv, tag, enc]).toString('hex');
}

/**
 * 세션 토큰을 복호화해 API 키 반환
 * 만료되었거나 위조된 경우 null 반환
 */
export function decrypt(token) {
  try {
    const secret = getSecret();
    const buf = Buffer.from(token, 'hex');
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);

    const decipher = crypto.createDecipheriv(ALGO, secret, iv);
    decipher.setAuthTag(tag);
    const plain = decipher.update(enc) + decipher.final('utf8');

    const { key, exp } = JSON.parse(plain);
    if (Date.now() > exp) return null; // 만료
    return key;
  } catch {
    return null; // 위조 또는 손상된 토큰
  }
}
