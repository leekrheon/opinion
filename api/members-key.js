/**
 * /api/members-key  —  멤버스 PIN 인증 & 세션 토큰 발급
 *
 * Vercel 환경변수:
 *   MEMBERS_PIN          — 4자리 코드
 *   MEMBERS_YOUTUBE_KEY  — 멤버스 전용 YouTube API 키
 *   SESSION_SECRET       — 암호화 비밀키 (필수)
 */

import crypto from 'crypto';
import { encrypt } from './_crypto.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code } = req.body ?? {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: '코드를 입력해주세요.' });
  }

  const validPin   = process.env.MEMBERS_PIN;
  const membersKey = process.env.MEMBERS_YOUTUBE_KEY;

  if (!validPin || !membersKey) {
    return res.status(503).json({ error: '멤버스 서비스가 설정되지 않았습니다.' });
  }

  // SHA-256으로 해시해 길이를 고정한 뒤 상수 시간 비교
  // → 입력 길이가 달라도 타이밍 정보가 새지 않음
  const inputHash = crypto.createHash('sha256').update(code).digest();
  const validHash = crypto.createHash('sha256').update(validPin).digest();
  const isValid   = crypto.timingSafeEqual(inputHash, validHash);

  if (!isValid) {
    return res.status(401).json({ error: '코드가 올바르지 않습니다.' });
  }

  const session = encrypt(membersKey);
  return res.status(200).json({ session });
}
