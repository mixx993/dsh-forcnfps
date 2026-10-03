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

let body = readFileSync(resolve(root, 'src/client.src.js'), 'utf8')
for (const [key, path] of Object.entries(pages)) {
  const token = `__GAME_HTML_${key}__`
  if (body.split(token).length !== 2) throw new Error(`client.src.js 里占位符 ${token} 应恰好出现一次`)
  const html = readFileSync(path, 'utf8').replace(KIT_TAG, () => `<script>\n${kit}</script>`)
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
