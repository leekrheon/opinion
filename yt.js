/**
 * /api/yt  —  YouTube API 프록시
 *
 * 클라이언트는 세션 토큰만 보냅니다. API 키는 서버 메모리에서만 조회됩니다.
 * 네트워크 탭, URL, 로그 어디에도 키가 노출되지 않습니다.
 *
 * POST body: { session, action, ...params }
 *   action: 'videoInfo' | 'comments'
 */

// 서버 메모리 세션 스토어 (Vercel 서버리스는 인스턴스가 재시작되면 초기화됨)
// 실서비스에서는 Redis/Upstash 등으로 교체 권장
const SESSION_STORE = globalThis._opinionSessions ?? (globalThis._opinionSessions = new Map());
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4시간

function getKey(session) {
  const entry = SESSION_STORE.get(session);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
    SESSION_STORE.delete(session);
    return null;
  }
  return entry.key;
}

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

export default async function handler(req, res) {
  // CORS 방어: 같은 오리진만 허용
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

  const key = getKey(session);
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
        part:        'snippet,replies',
        videoId:     vid,
        maxResults:  String(Math.min(100, parseInt(maxResults) || 100)),
        textFormat:  'plainText',
        order:       order === 'time' ? 'time' : 'relevance',
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
