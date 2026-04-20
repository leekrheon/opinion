/**
 * /api/register-key  —  개인 API 키 등록 & 세션 토큰 발급
 *
 * 클라이언트가 입력한 키를 서버에서 검증 후, 세션 토큰만 반환합니다.
 * 키는 서버 메모리에만 보관되며 클라이언트에 다시 내려가지 않습니다.
 *
 * POST body: { key: "AIzaSy..." }
 * Response:  { session: "hex..." }  또는  { error: "..." }
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

  const { key } = req.body ?? {};

  if (!key || typeof key !== 'string' || key.length < 10) {
    return res.status(400).json({ error: '유효하지 않은 키 형식입니다.' });
  }

  // 서버에서 키 유효성 검증 (클라이언트에 키 노출 없음)
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`
    );
    const d = await r.json();

    if (d.error) {
      return res.status(400).json({ error: '유효하지 않은 API KEY입니다.' });
    }

    const session = issueSession(key);
    return res.status(200).json({ session });

  } catch (e) {
    console.error('[/api/register-key] error:', e.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
