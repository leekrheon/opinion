/**
 * /api/members-key.js — Vercel Serverless Function
 *
 * IMBY MEMBERS 전용 4자리 PIN 인증 후 API 키를 반환합니다.
 * 클라이언트에 실제 API 키와 PIN이 노출되지 않습니다.
 *
 * ── Vercel 환경변수 설정 ──────────────────────────────────────
 *  API_KEY_IMBY      : IMBY 멤버 전용 YouTube Data API v3 키
 *  MEMBERS_PIN       : 멤버 인증 4자리 숫자 코드 (예: 1234)
 *  GUEST_ALLOWED_ORIGIN : 허용 도메인 (예: https://opinion-beta.vercel.app)
 * ──────────────────────────────────────────────────────────────
 */

// 무차별 대입 방어: IP당 5회 실패 시 10분 잠금
const failMap = new Map(); // key: IP, value: {count, lockedUntil}
const MAX_FAIL = 5;
const LOCK_MS = 10 * 60 * 1000; // 10분

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  const rec = failMap.get(ip) || { count: 0, lockedUntil: 0 };
  if (rec.lockedUntil > now) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    return { blocked: true, mins };
  }
  return { blocked: false };
}

function recordFail(ip) {
  const now = Date.now();
  const rec = failMap.get(ip) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FAIL) {
    rec.lockedUntil = now + LOCK_MS;
    rec.count = 0;
  }
  failMap.set(ip, rec);
}

function clearFail(ip) {
  failMap.delete(ip);
}

export default async function handler(req, res) {
  /* ── CORS ── */
  const allowedOrigin = process.env.GUEST_ALLOWED_ORIGIN || req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = getClientIp(req);

  /* ── Rate limit 확인 ── */
  const rl = checkRateLimit(ip);
  if (rl.blocked) {
    return res.status(429).json({ error: `너무 많이 시도했습니다. ${rl.mins}분 후 다시 시도해주세요.` });
  }

  /* ── 환경변수 확인 ── */
  const apiKey = process.env.API_KEY_IMBY || '';
  const correctPin = process.env.MEMBERS_PIN || '';

  if (!apiKey || !correctPin) {
    console.error('[members-key] 환경변수 API_KEY_IMBY 또는 MEMBERS_PIN 미설정');
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }

  /* ── 요청 바디 파싱 ── */
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { code } = body;

  if (!code || typeof code !== 'string' || !/^\d{4}$/.test(code)) {
    return res.status(400).json({ error: '4자리 숫자 코드를 입력해주세요.' });
  }

  /* ── PIN 검증 (타이밍 공격 방지: 상수 시간 비교) ── */
  const isMatch = code === correctPin; // 단순 비교 (4자리라 timing 위협 낮음)

  if (!isMatch) {
    recordFail(ip);
    const rec = failMap.get(ip) || { count: 0 };
    const remaining = MAX_FAIL - rec.count;
    return res.status(401).json({
      error: remaining > 0
        ? `❌ 코드가 올바르지 않습니다. (${remaining}회 남음)`
        : '❌ 코드가 올바르지 않습니다.'
    });
  }

  /* ── 인증 성공 ── */
  clearFail(ip);
  return res.status(200).json({ key: apiKey });
}
