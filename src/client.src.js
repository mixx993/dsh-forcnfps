// 网页端：在 DSH 右侧栏注册一个「ForCNFps」标签页。里面先显示选单（hub），选中后切到对应游戏；
// 顶部一条细栏放「‹ ForCNFps」返回按钮，并跟着当前会话显示状态——任务在跑时提示先玩一局，跑完提示回去看结果。
// 这是源文件，scripts/build.mjs 会把各页面的 HTML 填进来并包成 client.js。
const React = require('react')
const h = React.createElement
const { useEffect, useRef, useState } = React

const ID = 'dsh-forcnfps'
const HUB_HTML = __GAME_HTML_HUB__
const GAMES = {
  schulte: { title: '舒尔特斩', html: __GAME_HTML_SCHULTE__ },
  aim: { title: '瞄准训练', html: __GAME_HTML_AIM__ },
  hold: { title: '架枪训练', html: __GAME_HTML_HOLD__ },
}

// 当前会话是否有任务在跑。会话级插槽会带 useSession；拿不到就返回 undefined，不显示状态。
function useRunning(props) {
  if (typeof props.useSession !== 'function') return undefined
  return !!props.useSession(s => s && s.running)
}

function TopBar({ game, running, done, onBack, onDismiss }) {
  const tone = running ? '--dsw-alias-state-business-primary' : '--dsw-alias-state-success-primary'
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 8, flex: 'none', height: 30, padding: '0 10px',
      fontSize: 12, color: 'var(--dsw-alias-label-secondary, #555)',
      borderBottom: '1px solid var(--dsw-alias-border-l2, #e5e5e5)',
    },
  },
  game
    ? h('button', {
      onClick: onBack,
      style: {
        border: 0, background: 'none', padding: '2px 4px', margin: '0 0 0 -4px', borderRadius: 4, cursor: 'pointer',
        font: 'inherit', color: 'var(--dsw-alias-label-primary, #222)',
      },
    }, '‹ ForCNFps')
    : h('span', { style: { color: 'var(--dsw-alias-label-primary, #222)', fontWeight: 600 } }, 'ForCNFps'),
  game && h('span', { style: { color: 'var(--dsw-alias-label-tertiary, #999)' } }, GAMES[game].title),
  (running || done) && h('span', {
    onClick: done ? onDismiss : undefined,
    title: done ? '点一下收起' : undefined,
    style: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', cursor: done ? 'pointer' : 'default', whiteSpace: 'nowrap' },
  },
  h('span', {
    style: {
      width: 7, height: 7, borderRadius: 4, flex: 'none', background: `var(${tone}, #4d6bfe)`,
      animation: running ? 'dsh-arcade-pulse 1.2s ease-in-out infinite' : 'none',
    },
  }),
  running ? '智能体干活中' : '任务完成了'))
}

function ArcadeTab(props) {
  const running = useRunning(props)
  const prev = useRef(running)
  const [done, setDone] = useState(false)
  const [game, setGame] = useState(null)   // null 表示停在选单
  const frame = useRef(null)

  useEffect(() => {
    if (running) setDone(false)
    else if (prev.current && running === false) setDone(true)
    prev.current = running
  }, [running])

  // 选单页点了某个游戏、游戏里点了「退出」都会 postMessage 过来；只认自己这个 iframe 发的
  useEffect(() => {
    const onMessage = e => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const d = e.data
      if (d && d.type === 'dsh-arcade:open' && GAMES[d.game]) setGame(d.game)
      else if (d && d.type === 'dsh-arcade:home') setGame(null)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return h('div', {
    style: {
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0,
      background: 'var(--dsw-alias-bg-base, #fff)',
    },
  },
  h('style', null, '@keyframes dsh-arcade-pulse{0%,100%{opacity:1}50%{opacity:.25}}'),
  h(TopBar, { game, running, done, onBack: () => setGame(null), onDismiss: () => setDone(false) }),
  h('iframe', {
    key: game || 'hub',
    ref: frame,
    title: game ? GAMES[game].title : 'ForCNFps',
    srcDoc: game ? GAMES[game].html : HUB_HTML,
    // allow-same-origin 让游戏能用 localStorage 存设置和成绩，选单也能读到各游戏的最佳成绩；
    // allow-pointer-lock 让开了灵敏度换算的游戏能锁定鼠标、读原始位移
    sandbox: 'allow-scripts allow-same-origin allow-pointer-lock',
    style: { flex: 1, minHeight: 0, width: '100%', border: 0, display: 'block' },
  }))
}

exports.name = ID
exports.inject = ['slots', 'sidebarRightTabs']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: ID,
    kind: 'arcade',
    title: () => 'ForCNFps',
    keepMounted: true,
    guide: [{ id: 'play', order: 40, title: () => 'ForCNFps', description: () => '舒尔特斩 · 瞄准 · 架枪' }],
  }), 'dsh-forcnfps: 标签类型')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: ID,
  }, ArcadeTab)), 'dsh-forcnfps: 标签内容')
}
