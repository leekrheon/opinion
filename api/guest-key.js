/**
 * /api/guest-key.js — Vercel Serverless Function
 *
 * 게스트 모드용 YouTube API 키를 안전하게 제공합니다.
 * 클라이언트(브라우저)에 키가 직접 노출되지 않습니다.
 *
 * ── Vercel 환경변수 설정 ──────────────────────────────────────
 *  YOUTUBE_API_KEY1  : 첫 번째 YouTube Data API v3 키 (주 할당량)
 *  YOUTUBE_API_KEY2  : 백업 키 (KEY1 할당량 초과 시 자동 사용)
 *  GUEST_ALLOWED_ORIGIN : 허용 도메인 (예: https://opinion-beta.vercel.app)
 *                         설정 안 하면 같은 origin 자동 허용
 * ──────────────────────────────────────────────────────────────
 */

const YOUTUBE_QUOTA_ERROR_CODE = 403;
const TEST_VIDEO_ID = 'dQw4w9WgXcQ'; // 키 유효성 확인용 고정 영상 ID

/**
 * 키가 살아있는지(할당량 초과 아닌지) 확인
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function isKeyAlive(key) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=id&id=${TEST_VIDEO_ID}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      const code = data.error.code;
      // 403: quota exceeded or key invalid → try next
      // 400: bad request → treat as invalid
      if (code === 403 || code === 400) return false;
    }
    return true; // 정상 응답이면 사용 가능
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  /* ── CORS 설정 ── */
  const allowedOrigin = process.env.GUEST_ALLOWED_ORIGIN || req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store'); // 캐시 금지: 항상 신선한 키 상태 확인

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const key1 = process.env.API_KEY1 || '';
  const key2 = process.env.API_KEY2 || '';

  if (!key1 && !key2) {
    console.error('[guest-key] 환경변수 YOUTUBE_API_KEY1, YOUTUBE_API_KEY2 미설정');
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }

  /* ── KEY1 시도 → 실패 시 KEY2 폴백 ── */
  if (key1) {
    const alive = await isKeyAlive(key1);
    if (alive) {
      return res.status(200).json({ key: key1, source: 'key1' });
    }
    console.warn('[guest-key] KEY1 할당량 초과 또는 유효하지 않음 → KEY2로 전환');
  }

  if (key2) {
    const alive = await isKeyAlive(key2);
    if (alive) {
      return res.status(200).json({ key: key2, source: 'key2' });
    }
    console.error('[guest-key] KEY2도 사용 불가 — 모든 키 소진');
  }

  return res.status(503).json({ error: 'All guest API keys exhausted' });
}
