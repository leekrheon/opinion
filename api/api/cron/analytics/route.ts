import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 실시간 접속자 API
    const analyticsRes = await fetch(
      `https://vercel.com/api/web/insights/stats/current-visitors?` +
      new URLSearchParams({
        projectId: process.env.VERCEL_PROJECT_ID!,
      }),
      {
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
        },
      }
    )

    const data = await analyticsRes.json()
    const visitors = data?.count ?? 0

    let message = ''
    let priority = 'default'
    let tags = 'eyes'

    if (visitors >= 20) {
      message = `🔥 지금 ${visitors}명이 사이트 보고 있어요!`
      priority = 'urgent'
      tags = 'fire'
    } else if (visitors >= 10) {
      message = `🚀 지금 ${visitors}명이 접속 중!`
      priority = 'high'
      tags = 'rocket'
    } else if (visitors >= 5) {
      message = `😊 지금 ${visitors}명이 접속 중`
      priority = 'default'
      tags = 'smile'
    } else if (visitors >= 3) {
      message = `👀 지금 ${visitors}명이 접속 중`
      priority = 'default'
      tags = 'eyes'
    } else if (visitors >= 1) {
      message = `🙂 지금 ${visitors}명이 사이트에 있어요`
      priority = 'low'
      tags = 'slightly_smiling_face'
    }

    if (visitors >= 1) {
      await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        headers: {
          Title: '실시간 접속자 알림',
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
