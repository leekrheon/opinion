/**
 * /api/guest-session  —  게스트 세션 토큰 발급
 *
 * 클라이언트에 API 키를 내려주지 않고, 서버 메모리에 키를 보관한 뒤
 * 세션 토큰만 발급합니다.
 *
 * Vercel 환경변수:
 *   YOUTUBE_API_KEY1  — 기본 게스트 키
 *   YOUTUBE_API_KEY2  — 할당량 초과 시 폴백 키 (선택)
 */

import crypto from 'crypto';

const SESSION_STORE = globalThis._opinionSessions ?? (globalThis._opinionSessions = new Map());
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4시간

function issueSession(key) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSION_STORE.set(token, { key, createdAt: Date.now() });
  // 만료된 세션 간헐적 정리
  if (Math.random() < 0.05) {
    const now = Date.now();
    for (const [k, v] of SESSION_STORE) {
      if (now - v.createdAt > SESSION_TTL_MS) SESSION_STORE.delete(k);
    }
  }
  return token;
}

async function pickValidKey() {
  const candidates = [
    process.env.YOUTUBE_API_KEY1,
    process.env.YOUTUBE_API_KEY2,
  ].filter(Boolean);

  for (const key of candidates) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${key}`
      );
      const d = await r.json();
      if (!d.error) return key; // 유효한 키
    } catch (_) {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const key = await pickValidKey();
  if (!key) {
    return res.status(503).json({ error: '게스트 서비스가 일시적으로 사용 불가합니다.' });
  }

  const session = issueSession(key);
  return res.status(200).json({ session });
}
