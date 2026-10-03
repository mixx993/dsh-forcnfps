// 打包：把各页面的单文件 HTML 填进 src/client.src.js，再包成 DSH 网页端认的模块格式，输出 client.js。
// games/ 下的像素页面用 <script src="pixelkit.js"> 引用共用工具，这里会把它内联进去。
// 舒尔特斩是 schulte-slash 项目打出的单文件，复制在 games/schulte.html（可用环境变量 GAME_HTML 指向别的文件）。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pages = {
  HUB: resolve(root, 'games/hub.html'),
  SCHULTE: resolve(root, process.env.GAME_HTML || 'games/schulte.html'),
  AIM: resolve(root, 'games/aim.html'),
  HOLD: resolve(root, 'games/hold.html'),
}

const kit = readFileSync(resolve(root, 'games/pixelkit.js'), 'utf8')
if (kit.includes('</script')) throw new Error('pixelkit.js 里不能出现 </script，否则内联后会截断页面')
const KIT_TAG = '<script src="pixelkit.js"></script>'

// 舒尔特斩是别的项目打出来的单文件，没有回 ForCNFps 主界面的入口：打包时在左上角注入一个「‹ 退出」按钮，
// 再加 ESC 快捷键（舒尔特斩自己用 ESC 关「玩法」页，它处理过的按键会 preventDefault，这时不退出）
const SCHULTE_EXIT = `
<button id="forcnfps-exit" type="button" aria-label="退出到 ForCNFps 主界面">‹ 退出</button>
<style>
  #forcnfps-exit { position: fixed; left: 8px; top: 8px; z-index: 9; padding: 3px 10px; border-radius: 4px; cursor: pointer;
    border: 1px solid rgba(232, 226, 208, .28); background: rgba(12, 12, 18, .6); color: #e8e2d0;
    font: 12px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  #forcnfps-exit:hover { background: rgba(12, 12, 18, .85); border-color: rgba(232, 226, 208, .5); }
</style>
<script>
(() => {
  const home = () => { if (window.parent !== window) window.parent.postMessage({ type: 'dsh-arcade:home' }, '*') }
  const btn = document.getElementById('forcnfps-exit')
  btn.addEventListener('pointerdown', e => e.stopPropagation())
  btn.addEventListener('click', home)
  addEventListener('keydown', e => { if ((e.key === 'Escape' || e.key === 'Esc') && !e.defaultPrevented) home() })
})()
</script>
`

let body = readFileSync(resolve(root, 'src/client.src.js'), 'utf8')
for (const [key, path] of Object.entries(pages)) {
  const token = `__GAME_HTML_${key}__`
  if (body.split(token).length !== 2) throw new Error(`client.src.js 里占位符 ${token} 应恰好出现一次`)
  let html = readFileSync(path, 'utf8').replace(KIT_TAG, () => `<script>\n${kit}</script>`)
  if (key === 'SCHULTE') {
    if (!html.includes('</body>')) throw new Error('schulte.html 里找不到 </body>，没法注入退出按钮')
    html = html.replace('</body>', () => SCHULTE_EXIT + '</body>')
    if (process.env.DUMP_SCHULTE) writeFileSync(process.env.DUMP_SCHULTE, html)   // 调试：把注入后的页面写出来单独看
  }
  body = body.replace(token, () => JSON.stringify(html))
}

const out = [
  'window.__ModuleLoader__.load({ id: "dsh-forcnfps", factory: (require) => {',
  'var module = { exports: {} }; var exports = module.exports;',
  body,
  'return module.exports; } });',
  '',
].join('\n')

writeFileSync(resolve(root, 'client.js'), out)
console.log(`client.js 已生成（${(out.length / 1024).toFixed(0)} KB）`)
for (const [key, path] of Object.entries(pages)) console.log(`  ${key}: ${path}`)
