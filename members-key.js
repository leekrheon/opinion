/**
 * /api/members-key  —  멤버스 PIN 인증 & 세션 토큰 발급
 *
 * 기존: PIN 검증 후 { key } 반환  ← 클라이언트에 키 노출됨 (보안 취약)
 * 변경: PIN 검증 후 { session } 반환  ← 키는 서버에만 보관
 *
 * Vercel 환경변수:
 *   MEMBERS_PIN           — 멤버스 4자리 코드 (예: "1234")
 *   MEMBERS_YOUTUBE_KEY   — 멤버스 전용 YouTube API 키
 */

import crypto from 'crypto';

const SESSION_STORE = globalThis._opinionSessions ?? (globalThis._opinionSessions = new Map());
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4시간

function issueSession(key) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSION_STORE.set(token, { key, createdAt: Date.now() });
  if (Math.random() < 0.05) {
    const now = Date.now();
    for (const [k, v] of SESSION_STORE) {
      if (now - v.createdAt > SESSION_TTL_MS) SESSION_STORE.delete(k);
    }
  }
  return token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code } = req.body ?? {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: '코드를 입력해주세요.' });
  }

  const validPin = process.env.MEMBERS_PIN;
  const membersKey = process.env.MEMBERS_YOUTUBE_KEY;

  if (!validPin || !membersKey) {
    console.error('[/api/members-key] 환경변수 MEMBERS_PIN 또는 MEMBERS_YOUTUBE_KEY 미설정');
    return res.status(503).json({ error: '멤버스 서비스가 설정되지 않았습니다.' });
  }

  // 타이밍 공격 방지: timingSafeEqual 사용
  const inputBuf = Buffer.from(code.padEnd(8));
  const validBuf = Buffer.from(validPin.padEnd(8));
  const isValid =
    inputBuf.length === validBuf.length &&
    crypto.timingSafeEqual(inputBuf, validBuf);

  if (!isValid) {
    return res.status(401).json({ error: '코드가 올바르지 않습니다.' });
  }

  const session = issueSession(membersKey);
  return res.status(200).json({ session });
}
