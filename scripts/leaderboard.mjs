// 排行榜机器人：GitHub Actions 在有人开 Issue 时运行（见 .github/workflows/leaderboard.yml）。
//   node scripts/leaderboard.mjs apply   读 Issue 里的成绩数据，按游戏规则重算校验，合格就更新 leaderboard.json；结果写进 .leaderboard-result.json
//   node scripts/leaderboard.mjs reply   按结果在 Issue 下回复并关闭（设 DRY_RUN=1 时只打印回复，本地测试用）
// 只解析 JSON，不执行 Issue 里的任何内容。校验规则必须和 games/ 里的计分保持一致。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export const MARK = '<!-- forcnfps-score -->'
const BOARD = 'leaderboard.json', RESULT = '.leaderboard-result.json', KEEP = 100
export const GAME_NAME = { schulte: '舒尔特斩', aim: '瞄准训练', hold: '架枪训练' }

export function parseBody(body) {
  if (typeof body !== 'string' || !body.includes(MARK)) throw new Error('这不是 ForCNFps 生成的成绩提交')
  if (body.length > 20000) throw new Error('内容太长')
  const m = body.match(/```json\s*([\s\S]*?)```/)
  if (!m) throw new Error('找不到成绩数据')
  try { return JSON.parse(m[1]) } catch (e) { throw new Error('成绩数据被改坏了，解析不了') }
}

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi

// 返回要写进榜单的统计；不合格就抛出带原因的错误
export function validate(p) {
  if (!p || p.v !== 1) throw new Error('数据版本不对，请更新插件后再提交')
  if (p.game === 'hold') {
    // 每个击杀：敌人反应时间 = max(300, 650 - 25×之前的击杀数)，开枪暴露位置时再 ×0.6；你的反应必须在 100ms 以上且快过敌人
    const r = p.rounds
    if (!Array.isArray(r) || r.length < 1 || r.length > 80) throw new Error('击杀明细不对')
    let score = 0, heads = 0, rtSum = 0
    r.forEach((k, i) => {
      const base = Math.max(300, 650 - i * 25)
      if (!k || !(k.ttk === base || k.ttk === Math.round(base * 0.6))) throw new Error(`第 ${i + 1} 杀的敌人反应时间不符合规则`)
      if (!int(k.rt, 100, k.ttk - 1)) throw new Error(`第 ${i + 1} 杀的反应时间不合理（${k.rt}ms）`)
      if (!int(k.stab, 0, 100) || !(k.head === 0 || k.head === 1)) throw new Error(`第 ${i + 1} 杀的数据不对`)
      score += 100 + (k.head ? 50 : 0) + Math.round(Math.max(0, (k.ttk - k.rt) / k.ttk) * 100) + Math.round(k.stab / 2)
      heads += k.head; rtSum += k.rt
    })
    if (score !== p.score) throw new Error(`分数对不上：按明细算出来是 ${score}，提交的是 ${p.score}`)
    return { kills: r.length, score, rt: Math.round(rtSum / r.length), hs: Math.round(heads / r.length * 100) }
  }
  if (p.game === 'aim') {
    // 按顺序重放每次点击：命中 +100 + 速度加成（1 秒内最多 +50），空枪 -30（不低于 0）
    const q = p.seq
    if (!Array.isArray(q) || q.length < 1 || q.length > 600) throw new Error('点击明细不对')
    let score = 0, hits = 0, sum = 0
    for (const e of q) {
      if (e === -1) { score = Math.max(0, score - 30); continue }
      if (!int(e, 80, 30000)) throw new Error(`有一次命中的反应时间不合理（${e}ms）`)
      hits++; sum += e
      score += 100 + Math.round(50 * Math.min(1, Math.max(0, (1000 - e) / 700)))
    }
    if (sum > 30500) throw new Error('命中用时加起来超过了一局的 30 秒')
    if (score !== p.score) throw new Error(`分数对不上：按明细算出来是 ${score}，提交的是 ${p.score}`)
    return { score, hits, acc: Math.round(hits / q.length * 100) }
  }
  if (p.game === 'schulte') {
    // 舒尔特斩本地没有每一刀的明细，只能查数值是否合理
    if (p.n !== 5) throw new Error('舒尔特斩只收 5×5 方阵的成绩')
    if (typeof p.time !== 'number' || !(p.time >= 6 && p.time <= 600)) throw new Error(`用时不合理（${p.time} 秒）`)
    if (!int(p.score, 1, 10000000)) throw new Error('分数不对')
    return { time: Math.round(p.time * 100) / 100, score: p.score, rank: typeof p.rank === 'string' ? p.rank.slice(0, 8) : '' }
  }
  throw new Error('不认识的游戏')
}

// 排序：架枪先比击杀再比分；瞄准比分；舒尔特比用时
export const ORDER = {
  hold: (a, b) => b.kills - a.kills || b.score - a.score,
  aim: (a, b) => b.score - a.score,
  schulte: (a, b) => a.time - b.time || b.score - a.score,
}

// 每人每个游戏只留最好的一条；返回是否刷新了自己的纪录、名次（0 表示没进前 KEEP）
export function merge(board, game, entry) {
  board.boards ||= {}
  const list = board.boards[game] ||= []
  const old = list.find(e => e.user === entry.user)
  if (old && ORDER[game](entry, old) >= 0) return { improved: false, rank: list.indexOf(old) + 1, best: old }
  if (old) list.splice(list.indexOf(old), 1)
  list.push(entry)
  list.sort(ORDER[game])
  board.boards[game] = list.slice(0, KEEP)
  return { improved: true, rank: board.boards[game].indexOf(entry) + 1, best: entry }
}

const show = (game, s) => game === 'hold' ? `${s.kills} 杀 · ${s.score} 分` : game === 'aim' ? `${s.score} 分` : `5×5 ${s.time.toFixed(2)} 秒`

async function api(path, method, body) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GitHub API ${method} ${path}: ${res.status} ${await res.text()}`)
}

async function main(mode) {
  const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const issue = ev.issue
  if (mode === 'apply') {
    let result
    try {
      if (issue.user.type === 'Bot') throw new Error('机器人账号不能上榜')
      const p = parseBody(issue.body)
      const stats = validate(p)
      const board = existsSync(BOARD) ? JSON.parse(readFileSync(BOARD, 'utf8')) : { v: 1, boards: {} }
      const entry = { user: issue.user.login, ...stats, at: new Date().toISOString().slice(0, 10), issue: issue.number }
      const r = merge(board, p.game, entry)
      if (r.improved) {
        board.updated = new Date().toISOString()
        writeFileSync(BOARD, JSON.stringify(board, null, 1) + '\n')
      }
      result = { ok: true, game: p.game, improved: r.improved, rank: r.rank, stats, best: r.best }
    } catch (e) {
      result = { ok: false, error: e.message }
    }
    writeFileSync(RESULT, JSON.stringify(result))
    console.log(result)
  } else if (mode === 'reply') {
    const r = JSON.parse(readFileSync(RESULT, 'utf8'))
    let text
    if (!r.ok) text = `没能上榜：${r.error}。\n\n如果觉得是误判，可以在这里留言。\n\n_Not accepted: ${r.error}_`
    else if (!r.improved) text = `审核通过，但这次（${show(r.game, r.stats)}）没有超过你在${GAME_NAME[r.game]}榜上的最好成绩（${show(r.game, r.best)}，第 ${r.rank} 名），榜单不变。`
    else if (!r.rank) text = `审核通过（${show(r.game, r.stats)}），可惜没进${GAME_NAME[r.game]}前 ${KEEP} 名。`
    else text = `已上榜：${GAME_NAME[r.game]}第 ${r.rank} 名（${show(r.game, r.stats)}）。插件里一两分钟后就能看到。\n\n_Accepted: rank #${r.rank}._`
    if (process.env.DRY_RUN) { console.log('[dry run] 回复：\n' + text); return }   // 本地测试：只打印不调用 GitHub
    await api(`issues/${issue.number}/comments`, 'POST', { body: text })
    await api(`issues/${issue.number}`, 'PATCH', { state: 'closed', state_reason: r.ok ? 'completed' : 'not_planned' })
  }
}

if (process.argv[2]) main(process.argv[2]).catch(e => { console.error(e); process.exit(1) })
