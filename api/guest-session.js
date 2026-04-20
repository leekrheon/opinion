/**
 * /api/guest-session  —  게스트 세션 토큰 발급
 *
 * API 키를 AES-256-GCM으로 암호화한 토큰을 반환합니다.
 * 클라이언트는 토큰만 보관하며, 키 자체는 복호화 불가합니다.
 *
 * Vercel 환경변수:
 *   YOUTUBE_API_KEY1  — 기본 게스트 키
 *   YOUTUBE_API_KEY2  — 폴백 키 (선택)
 *   SESSION_SECRET    — 암호화 비밀키 (필수, openssl rand -hex 32)
 */

import { encrypt } from './_crypto.js';

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
      if (!d.error) return key;
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

  const session = encrypt(key);
  return res.status(200).json({ session });
}
