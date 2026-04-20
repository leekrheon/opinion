/**
 * /api/yt  —  YouTube API 프록시
 *
 * 세션 토큰을 복호화해 API 키를 얻고, YouTube API를 서버에서 호출합니다.
 * 키는 URL/네트워크 탭/로그 어디에도 노출되지 않습니다.
 * 서버 메모리 스토어 불필요 → Vercel 서버리스 인스턴스 간 문제 없음.
 *
 * POST body: { session, action, vid?, maxResults?, order?, pageToken? }
 */

import { decrypt } from './_crypto.js';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  const host   = req.headers['host']   || '';
  if (origin && !origin.includes(host.split(':')[0])) {
    return res.status(403).json({ error: { code: 403, message: 'Forbidden' } });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 405, message: 'Method Not Allowed' } });
  }

  const { session, action, vid, maxResults, order, pageToken } = req.body ?? {};

  if (!session || !action) {
    return res.status(400).json({ error: { code: 400, message: 'session and action are required' } });
  }

  const key = decrypt(session);
  if (!key) {
    return res.status(401).json({ error: { code: 401, message: '세션이 만료되었습니다. 다시 로그인해주세요.' } });
  }

  try {
    if (action === 'videoInfo') {
      if (!vid) return res.status(400).json({ error: { code: 400, message: 'vid required' } });

      const url = `${YT_BASE}/videos?part=snippet&id=${encodeURIComponent(vid)}&key=${key}`;
      const r = await fetch(url);
      const d = await r.json();

      if (d.error) return res.status(200).json({ error: d.error });
      if (!d.items?.length) return res.status(200).json({ title: '—', channel: '—' });

      const s = d.items[0].snippet;
      return res.status(200).json({ title: s.title, channel: s.channelTitle });
    }

    if (action === 'comments') {
      if (!vid) return res.status(400).json({ error: { code: 400, message: 'vid required' } });

      const params = new URLSearchParams({
        part:       'snippet,replies',
        videoId:    vid,
        maxResults: String(Math.min(100, parseInt(maxResults) || 100)),
        textFormat: 'plainText',
        order:      order === 'time' ? 'time' : 'relevance',
        key,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const url = `${YT_BASE}/commentThreads?${params.toString()}`;
      const r = await fetch(url);
      const d = await r.json();

      return res.status(200).json(d);
    }

    return res.status(400).json({ error: { code: 400, message: `Unknown action: ${action}` } });

  } catch (e) {
    console.error('[/api/yt] error:', e.message);
    return res.status(500).json({ error: { code: 500, message: '서버 오류가 발생했습니다.' } });
  }
}
