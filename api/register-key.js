/**
 * /api/register-key  —  개인 API 키 등록 & 세션 토큰 발급
 *
 * 키를 서버에서 검증 후 암호화된 세션 토큰만 반환합니다.
 * 키는 토큰 안에 암호화되어 있어 클라이언트에서 읽을 수 없습니다.
 *
 * Vercel 환경변수:
 *   SESSION_SECRET  — 암호화 비밀키 (필수)
 */

import { encrypt } from './_crypto.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { key } = req.body ?? {};

  if (!key || typeof key !== 'string' || key.length < 10) {
    return res.status(400).json({ error: '유효하지 않은 키 형식입니다.' });
  }

  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`
    );
    const d = await r.json();

    if (d.error) {
      return res.status(400).json({ error: '유효하지 않은 API KEY입니다.' });
    }

    const session = encrypt(key);
    return res.status(200).json({ session });

  } catch (e) {
    console.error('[/api/register-key] error:', e.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
