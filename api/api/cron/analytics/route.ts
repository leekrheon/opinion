import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const analyticsRes = await fetch(
      `https://vercel.com/api/web/insights/stats/visitors?` +
      new URLSearchParams({
        projectId: process.env.VERCEL_PROJECT_ID!,
        from: oneHourAgo.toISOString(),
        to: now.toISOString(),
        tz: 'Asia/Seoul',
        environment: 'production',
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
        },
      }
    )

    const data = await analyticsRes.json()
    const visitors = data?.total ?? 0

    // 방문자 수에 따라 다른 메시지
    let message = ''
    let priority = 'default'
    let tags = 'chart_increasing'

    if (visitors >= 20) {
      message = `🔥 와! 지난 1시간 방문자 ${visitors}명!`
      priority = 'urgent'
      tags = 'fire,chart_increasing'
    } else if (visitors >= 10) {
      message = `🚀 지난 1시간 방문자 ${visitors}명!`
      priority = 'high'
      tags = 'rocket,chart_increasing'
    } else if (visitors >= 5) {
      message = `😊 지난 1시간 방문자 ${visitors}명`
      priority = 'default'
    } else if (visitors >= 3) {
      message = `👀 지난 1시간 방문자 ${visitors}명`
      priority = 'default'
    } else if (visitors >= 1) {
      message = `🙂 지난 1시간 방문자 ${visitors}명`
      priority = 'low'
    }

    if (visitors >= 1) {
      await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        headers: {
          Title: 'Vercel 방문자 알림',
          Priority: priority,
          Tags: tags,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: message,
      })
    }

    return NextResponse.json({ visitors, notified: visitors >= 1 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
