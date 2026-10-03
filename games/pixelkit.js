// 像素小游戏共用工具：低分辨率画布 + 整数倍放大、Sweetie 16 调色板、3×5 点阵字、中文像素字、图标、像素圆、面板、按钮、本地存储、8-bit 音效，
// 以及按 CS2 / 瓦罗兰特 灵敏度换算准星移动的鼠标锁定。
// 单独预览时由 <script src="pixelkit.js"> 加载；scripts/build.mjs 打包时会把它内联进每个页面。
window.PK = (() => {
  const C = {
    ink: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57', gold: '#ffcd75', lime: '#a7f070',
    green: '#38b764', teal: '#257179', navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7',
    white: '#f4f4f4', fog: '#94b0c2', slate: '#566c86', dusk: '#333c57',
  }
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches
  const store = {
    get(k) { try { return localStorage.getItem(k) } catch (e) { return null } },
    set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  }
  const json = k => { try { return JSON.parse(store.get(k) || 'null') } catch (e) { return null } }
  const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]   // 4×4 Bayer 抖动矩阵

  let g = null   // 当前绘制目标：screen() 创建的低分辨率缓冲

  // 画布：所有内容画在约 targetW 像素宽的缓冲上，再无平滑整数倍放大到屏幕
  function screen(cv, { targetW = 132, minH = 200 } = {}) {
    const out = cv.getContext('2d'), buf = document.createElement('canvas')
    const S = { cv, buf, g: buf.getContext('2d'), P: 2, W: 0, H: 0, OX: 0, OY: 0 }
    g = S.g
    S.resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 3)
      const dw = Math.round(innerWidth * dpr), dh = Math.round(innerHeight * dpr)
      cv.width = dw; cv.height = dh
      S.P = Math.max(2, Math.floor(Math.min(dw / targetW, dh / minH)))   // 一个美术像素占几个设备像素
      S.W = Math.floor(dw / S.P); S.H = Math.floor(dh / S.P)
      S.OX = Math.floor((dw - S.W * S.P) / 2); S.OY = Math.floor((dh - S.H * S.P) / 2)
      buf.width = S.W; buf.height = S.H
      S.g.imageSmoothingEnabled = false
    }
    S.toBuf = e => {
      const r = cv.getBoundingClientRect()
      return {
        x: ((e.clientX - r.left) * (cv.width / r.width) - S.OX) / S.P,
        y: ((e.clientY - r.top) * (cv.height / r.height) - S.OY) / S.P,
      }
    }
    S.present = (shakeX = 0) => {
      out.imageSmoothingEnabled = false
      out.fillStyle = C.ink
      out.fillRect(0, 0, cv.width, cv.height)
      out.drawImage(buf, S.OX + shakeX * S.P, S.OY, S.W * S.P, S.H * S.P)
    }
    return S
  }

  // 3×5 点阵字（数字、英文、少量符号）
  const F = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
    '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
    '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', '-': '000000111000000',
    '%': '101001010100101', '.': '000000000000010', ':': '000010000010000', '/': '001001010100100',
    '!': '010010010000010', '<': '001010100010001', '>': '100010001010100', ' ': '000000000000000',
    '·': '000000010000000',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
    Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
  }
  const btextW = (str, s = 1) => String(str).length * 4 * s - s
  function btext(str, x, y, col, s = 1, align = 'left') {
    str = String(str).toUpperCase()
    const w = btextW(str, s)
    if (align === 'center') x -= Math.floor(w / 2)
    else if (align === 'right') x -= w
    x = Math.round(x); y = Math.round(y)
    g.fillStyle = col
    for (const ch of str) {
      const gl = F[ch]
      if (gl) for (let i = 0; i < 15; i++) if (gl[i] === '1') g.fillRect(x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s)
      x += 4 * s
    }
  }

  // 中文像素字：系统字体画在小画布上，按透明度阈值二值化后贴到像素网格。12px 用于正文，16px 用于标题
  const textCache = new Map()
  function ctextSprite(str, col, size, bold) {
    const key = [str, col, size, bold].join('|')
    let c = textCache.get(key)
    if (c) return c
    c = document.createElement('canvas')
    const x2 = c.getContext('2d')
    const font = `${bold ? '700 ' : ''}${size}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif`
    x2.font = font
    c.width = Math.ceil(x2.measureText(str).width) + 2; c.height = size + 3
    x2.font = font; x2.textBaseline = 'top'; x2.fillStyle = '#fff'
    x2.fillText(str, 1, 1)
    const img = x2.getImageData(0, 0, c.width, c.height), d = img.data
    const n = parseInt(col.slice(1), 16)
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] >= (bold ? 140 : 80)) { d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255 }
      else d[i + 3] = 0
    }
    x2.putImageData(img, 0, 0)
    textCache.set(key, c)
    return c
  }
  function ctext(str, x, y, col, { align = 'left', bold = false, size = 12, shadow = null } = {}) {
    const c = ctextSprite(str, col, size, bold)
    if (align === 'center') x -= Math.floor(c.width / 2)
    else if (align === 'right') x -= c.width
    x = Math.round(x); y = Math.round(y)
    if (shadow) g.drawImage(ctextSprite(str, shadow, size, bold), x, y + 1)
    g.drawImage(c, x, y)
    return c.width
  }

  // 图标：字符串数组，# 为实心像素
  const ICON = {
    star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
    clock: ['..###..', '.#...#.', '#..#..#', '#..##.#', '#.....#', '.#...#.', '..###..'],
    aim: ['...#...', '..#.#..', '.#...#.', '#..#..#', '.#...#.', '..#.#..', '...#...'],
    spk: ['...#.....', '..##...#.', '####.#..#', '####.#..#', '####.#..#', '..##...#.', '...#.....'],
    mute: ['...#.....', '..##.....', '####.#.#.', '####..#..', '####.#.#.', '..##.....', '...#.....'],
    mouse: ['..#..', '.###.', '#.#.#', '#####', '#...#', '#...#', '.###.'],
  }
  function icon(name, x, y, col) {
    g.fillStyle = col
    ;(ICON[name] || name).forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.fillRect(x + i, y + j, 1, 1) })
  }

  // 像素圆环（中点画圆法）
  function ring(cx, cy, r, col) {
    g.fillStyle = col
    let x = r, y = 0, err = 1 - r
    while (x >= y) {
      for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) g.fillRect(cx + a, cy + b, 1, 1)
      y++
      if (err < 0) err += 2 * y + 1
      else { x--; err += 2 * (y - x) + 1 }
    }
  }

  // 圆角像素面板
  function panel(x, y, w, h, border = C.dusk) {
    g.fillStyle = border
    g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2)
    g.fillStyle = C.ink
    g.fillRect(x + 1, y + 1, w - 2, h - 2)
    g.fillStyle = C.navy
    g.fillRect(x + 2, y + 1, w - 4, 1)
  }

  // 立体像素按钮，返回点击区域
  function button(x, y, w, label, h = 18) {
    g.fillStyle = C.red; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2)
    g.fillStyle = C.orange; g.fillRect(x + 1, y, w - 2, h - 2); g.fillRect(x, y + 1, w, h - 4)
    g.fillStyle = C.gold; g.fillRect(x + 2, y + 1, w - 4, 1)
    ctext(label, x + Math.floor(w / 2), y + 2, C.ink, { align: 'center', bold: true })
    return { x, y, w, h }
  }
  const inRect = (x, y, r) => !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

  // 背景星点：固定种子，少数会闪
  function starfield(W, H, seed = 20260403) {
    let s = seed
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    const out = []
    for (let i = 0, n = Math.floor(W * H / 560); i < n; i++) out.push({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * H), p: rnd() * 6.28, tw: rnd() < 0.25 })
    return out
  }
  function drawStars(stars, now, skip) {
    for (const s of stars) {
      if (skip && inRect(s.x, s.y, skip)) continue
      g.fillStyle = s.tw && !RM && Math.sin(now / 600 + s.p) > 0.7 ? C.fog : C.dusk
      g.fillRect(s.x, s.y, 1, 1)
    }
  }

  // 8-bit 音效（方波/三角波/噪声），静音设置三个游戏共用
  const audio = (() => {
    const KEY = 'dsh-arcade-mute-v1'
    let ac = null, noiseBuf = null, muted = store.get(KEY) === '1'
    function unlock() {
      if (!ac) {
        try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { return }
        noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate)
        const d = noiseBuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      }
      if (ac.state === 'suspended') ac.resume()
    }
    // semi：相对 C5 的半音数
    function note(semi, dur = 0.07, type = 'square', vol = 0.05, delay = 0) {
      if (muted || !ac) return
      const t = ac.currentTime + delay, o = ac.createOscillator(), gn = ac.createGain()
      o.type = type
      o.frequency.setValueAtTime(523.25 * Math.pow(2, semi / 12), t)
      gn.gain.setValueAtTime(vol, t)
      gn.gain.setValueAtTime(vol, t + dur * 0.6)
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(gn).connect(ac.destination)
      o.start(t); o.stop(t + dur + 0.02)
    }
    const arp = (semis, step, type) => semis.forEach((s, i) => note(s, step * 1.6, type, 0.045, i * step))
    function noise(dur = 0.08, vol = 0.06, delay = 0) {
      if (muted || !ac) return
      const src = ac.createBufferSource(), gn = ac.createGain(), t = ac.currentTime + delay
      src.buffer = noiseBuf
      gn.gain.setValueAtTime(vol, t)
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      src.connect(gn).connect(ac.destination)
      src.start(t); src.stop(t + dur + 0.02)
    }
    return {
      unlock, note, arp, noise,
      get muted() { return muted },
      toggle() { muted = !muted; store.set(KEY, muted ? '1' : '0'); if (!muted) { unlock(); note(12, 0.06) } },
    }
  })()

  // 左下角「‹ 退出」按钮，返回点击区域；点了调用 goHome()
  function exitButton(H) {
    const x = 3, y = H - 16, w = 40, h = 14
    g.fillStyle = C.dusk; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2)
    g.fillStyle = C.ink; g.fillRect(x + 1, y + 1, w - 2, h - 2)
    btext('<', x + 4, y + 5, C.fog)
    ctext('退出', x + 10, y + 1, C.fog)
    return { x, y, w, h }
  }
  // 回 ForCNFps 主界面：先解锁鼠标，嵌在插件里就通知外层切回选单，单独打开时直接跳到 hub.html
  function goHome() {
    if (document.pointerLockElement) document.exitPointerLock()
    if (window.parent !== window) window.parent.postMessage({ type: 'dsh-arcade:home' }, '*')
    else location.href = 'hub.html'
  }

  // 右下角静音按钮，返回点击区域
  function muteButton(W, H) {
    const x = W - 13, y = H - 11
    icon(audio.muted ? 'mute' : 'spk', x, y, C.slate)
    return { x: x - 3, y: y - 3, w: 15, h: 13 }
  }

  // CS 风格准星：四根短线，带一圈深色描边；kick 是开枪时张开的像素数
  function crosshair(x, y, kick = 0, col = C.lime) {
    x = Math.round(x); y = Math.round(y)
    const gap = 2 + kick, len = 3
    const arms = [[x - gap - len, y, len, 1], [x + gap + 1, y, len, 1], [x, y - gap - len, 1, len], [x, y + gap + 1, 1, len]]
    g.fillStyle = C.ink
    for (const [ax, ay, w, h] of arms) g.fillRect(ax - 1, ay - 1, w + 2, h + 2)
    g.fillStyle = col
    for (const [ax, ay, w, h] of arms) g.fillRect(ax, ay, w, h)
  }

  // ---------- 灵敏度 ----------
  // 游戏里每个鼠标计数转动「灵敏度 × yaw」度；fov 是 16:9 下的水平视野，用来把角度换成画面上的像素
  const SENS_GAMES = {
    cs: { name: 'CS2/CSGO', short: 'CS2', yaw: 0.022, fov: 106.26 },
    val: { name: '瓦罗兰特', short: 'VAL', yaw: 0.07, fov: 103 },
  }
  const SENS_KEY = 'dsh-arcade-sens-v1', RAW_KEY = 'dsh-arcade-raw-v1'
  const sens = {
    games: SENS_GAMES,
    get() {
      const v = json(SENS_KEY) || {}
      return { game: SENS_GAMES[v.game] ? v.game : 'cs', dpi: v.dpi > 0 ? v.dpi : 800, value: v.value > 0 ? v.value : 1.2, on: v.on === true }
    },
    set(v) { store.set(SENS_KEY, JSON.stringify({ game: v.game, dpi: v.dpi, value: v.value, on: v.on })) },
    edpi: v => Math.round(v.dpi * v.value),
    cm360: v => 360 / (v.value * SENS_GAMES[v.game].yaw) / v.dpi * 2.54,          // 转一圈要移动多少厘米
    convert: (v, to) => v.value * SENS_GAMES[v.game].yaw / SENS_GAMES[to].yaw,    // 换算成另一款游戏的等效灵敏度
    raw: () => store.get(RAW_KEY),     // '1' 原始输入已开启，'0' 只能普通锁定，'x' 锁定被拒绝，null 还没检测过
  }

  // 准星位置：灵敏度开关打开时，点一下锁定鼠标，按游戏公式把原始位移换算成准星移动；没开或没锁定时就跟着系统光标走
  function pointer(S) {
    const P = { x: 0, y: 0, locked: false }
    let handler = null
    S.cv.addEventListener('pointermove', e => { if (!P.locked) Object.assign(P, S.toBuf(e)) })
    document.addEventListener('mousemove', e => {
      if (!P.locked) return
      const v = sens.get(), gm = SENS_GAMES[v.game]
      const k = v.value * gm.yaw * (S.W / gm.fov)       // 每个计数走多少美术像素 = 度/计数 × 像素/度（画布宽度对应水平视野）
      P.x = Math.max(0, Math.min(S.W - 1, P.x + e.movementX * k))
      P.y = Math.max(0, Math.min(S.H - 1, P.y + e.movementY * k))
    })
    document.addEventListener('pointerlockchange', () => { P.locked = document.pointerLockElement === S.cv })
    S.cv.addEventListener('pointerdown', e => {
      e.preventDefault()
      if (!P.locked) Object.assign(P, S.toBuf(e))
      if (handler) handler(P, e)
    })
    P.onDown = fn => { handler = fn }
    P.wantsLock = () => sens.get().on && !P.locked && !P.failed
    // 优先要「原始输入」（不经过系统指针加速）；不支持就退回普通锁定，手感只能参考；连普通锁定都被拒绝，就本次不再尝试，准星跟着系统光标走
    P.lock = () => {
      if (!P.wantsLock() || !S.cv.requestPointerLock) return
      const refuse = () => { P.failed = true; store.set(RAW_KEY, 'x') }
      const basic = () => {
        try {
          const r = S.cv.requestPointerLock()
          if (r && r.then) r.then(() => store.set(RAW_KEY, '0'), refuse)
        } catch (e) { refuse() }
      }
      try {
        const r = S.cv.requestPointerLock({ unadjustedMovement: true })
        if (r && r.then) r.then(() => store.set(RAW_KEY, '1'), basic)
        else document.addEventListener('pointerlockerror', refuse, { once: true })   // 老接口没有 Promise，只能靠事件判断
      } catch (e) { basic() }
    }
    P.unlock = () => { if (P.locked) document.exitPointerLock() }
    P.center = () => { P.x = S.W / 2; P.y = S.H / 2 }
    return P
  }

  return { C, RM, B4, store, json, screen, btext, btextW, ctext, icon, ring, panel, button, inRect, starfield, drawStars, audio, muteButton, exitButton, goHome, crosshair, sens, pointer }
})()
