import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import markdownIt from 'markdown-it'
import container from 'markdown-it-container'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BUILTIN_ICON_NAMES = ['blog', 'github', 'email', 'phone']

function loadIconSvgByName(rootDir) {
  const iconsDir = path.join(rootDir, 'assets', 'icons')
  const map = Object.create(null)
  for (const name of BUILTIN_ICON_NAMES) {
    const filePath = path.join(iconsDir, `${name}.svg`)
    map[name] = fs.readFileSync(filePath, 'utf8').trim()
  }
  return map
}

/** @param {Record<string, string>} iconSvgByName */
function resumeIconInlinePlugin(iconSvgByName) {
  const re = /^\[\[icon:([a-z0-9-]+)\]\]/
  return function install(md) {
    function rule(state, silent) {
      const slice = state.src.slice(state.pos)
      const match = re.exec(slice)
      if (!match) return false
      const name = match[1]
      const svg = iconSvgByName[name]
      if (!svg) {
        console.warn(
          `[resume-md-template] Unknown icon: "${name}". Built-in names: ${BUILTIN_ICON_NAMES.join(', ')}.`,
        )
        return false
      }
      if (silent) return true
      const token = state.push('html_inline', '', 0)
      token.content = `<span class="resume-icon" aria-hidden="true">${svg}</span>`
      state.pos += match[0].length
      return true
    }
    md.inline.ruler.after('backticks', 'resume_icon_inline', rule)
  }
}

function extractTitle(markdown) {
  const m = markdown.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : '简历'
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function extractInnerFromMap(src, map) {
  const lines = src.split(/\r?\n/)
  return lines.slice(map[0] + 1, map[1]).join('\n')
}

/** 独占一行且 trim 后为 `---` 的视为栏分隔，得到 1～N 段正文 */
function splitJobRowSegments(innerSrc) {
  const lines = innerSrc.split(/\r?\n/)
  const chunks = []
  let buf = []
  for (const line of lines) {
    if (line.trim() === '---') {
      chunks.push(buf.join('\n'))
      buf = []
    } else {
      buf.push(line)
    }
  }
  chunks.push(buf.join('\n'))
  return chunks.map((c) => c.trim())
}

function buildJobRowHtml(innerSrc, mdInline) {
  const segments = splitJobRowSegments(innerSrc)
  const n = segments.length
  const many = n >= 4 ? ' job-row--many' : ''
  const colClass = (i) => {
    if (n === 1) return 'job-row__cell job-row__cell--only'
    if (n === 2)
      return i === 0 ? 'job-row__cell job-row__cell--start' : 'job-row__cell job-row__cell--end'
    if (n === 3) {
      if (i === 0) return 'job-row__cell job-row__cell--start'
      if (i === 1) return 'job-row__cell job-row__cell--mid'
      return 'job-row__cell job-row__cell--end'
    }
    return `job-row__cell job-row__cell--i${i}`
  }
  const parts = segments.map((seg, i) => {
    const inner = seg ? mdInline.renderInline(seg) : ''
    return `<span class="${colClass(i)}">${inner}</span>`
  })
  return `<div class="job-row job-row--cols-${n}${many}">${parts.join('')}</div>`
}

function foldJobRowContainers(tokens, src, mdInline) {
  const result = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.type === 'container_job-row_open') {
      const map = t.map
      let j = i + 1
      while (j < tokens.length && tokens[j].type !== 'container_job-row_close') {
        j++
      }
      const innerSrc = extractInnerFromMap(src, map)
      const html = buildJobRowHtml(innerSrc, mdInline)
      result.push({ type: 'html_block', block: true, content: html })
      i = j < tokens.length ? j + 1 : tokens.length
      continue
    }
    result.push(t)
    i++
  }
  return result
}

function foldPhotoContainers(tokens, src) {
  const result = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.type === 'container_photo_open') {
      const map = t.map
      let j = i + 1
      while (j < tokens.length && tokens[j].type !== 'container_photo_close') {
        j++
      }
      const innerSrc = extractInnerFromMap(src, map)
      const pathLine =
        innerSrc
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l) || ''
      const html = `<figure class="resume-photo"><img src="${escapeHtml(pathLine)}" alt="证件照" loading="lazy" /></figure>`
      result.push({ type: 'html_block', block: true, content: html })
      i = j < tokens.length ? j + 1 : tokens.length
      continue
    }
    result.push(t)
    i++
  }
  return result
}

function renderMarkdownFolded(mdPhoto, mdInline, src) {
  let tokens = mdPhoto.parse(src, {})
  tokens = foldJobRowContainers(tokens, src, mdInline)
  tokens = foldPhotoContainers(tokens, src)
  return mdPhoto.renderer.render(tokens, mdPhoto.options, {})
}

/** 若首段非空行是一级标题 `# …`，拆出 h1 HTML 与其余 Markdown */
function extractLeadingH1(leftMd, mdPhoto, mdInline) {
  const lines = leftMd.split(/\r?\n/)
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (i >= lines.length || !/^#\s+/.test(lines[i])) {
    return { h1Html: '', restMd: leftMd }
  }
  const h1Html = renderMarkdownFolded(mdPhoto, mdInline, lines[i])
  const restMd = lines.slice(i + 1).join('\n')
  return { h1Html, restMd }
}

function buildResumeHeaderHtml(innerMd, mdPhoto, mdInline) {
  const lines = innerMd.split(/\r?\n/)
  let hrIdx = -1
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].trim() === '---') {
      hrIdx = k
      break
    }
  }
  if (hrIdx === -1) {
    const mainHtml = renderMarkdownFolded(mdPhoto, mdInline, innerMd)
    return `<div class="resume-header"><div class="resume-header__main">${mainHtml}</div></div>`
  }
  const left = lines.slice(0, hrIdx).join('\n')
  const rightPart = lines.slice(hrIdx + 1).join('\n')
  const rightLines = rightPart.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let photoHtml = ''
  if (rightLines.length >= 2 && rightLines[0] === 'photo') {
    const imgSrc = rightLines[1]
    photoHtml = `<figure class="resume-photo"><img src="${escapeHtml(imgSrc)}" alt="证件照" loading="lazy" /></figure>`
  }
  if (!photoHtml) {
    const mainHtml = renderMarkdownFolded(mdPhoto, mdInline, left)
    return `<div class="resume-header"><div class="resume-header__main">${mainHtml}</div></div>`
  }
  const { h1Html, restMd } = extractLeadingH1(left, mdPhoto, mdInline)
  const mainHtml = renderMarkdownFolded(mdPhoto, mdInline, restMd)
  const row = `<div class="resume-header__row"><div class="resume-header__main">${mainHtml}</div>${photoHtml}</div>`
  if (h1Html) {
    return `<div class="resume-header resume-header--has-photo">${h1Html}${row}</div>`
  }
  return `<div class="resume-header resume-header--has-photo">${row}</div>`
}

function foldResumeHeaderContainers(tokens, src, mdPhoto, mdInline) {
  const result = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.type === 'container_resume-header_open') {
      const map = t.map
      let j = i + 1
      while (j < tokens.length && tokens[j].type !== 'container_resume-header_close') {
        j++
      }
      const innerSrc = extractInnerFromMap(src, map)
      const html = buildResumeHeaderHtml(innerSrc, mdPhoto, mdInline)
      result.push({ type: 'html_block', block: true, content: html })
      i = j < tokens.length ? j + 1 : tokens.length
      continue
    }
    result.push(t)
    i++
  }
  return result
}

function createMdWithContainers(includeResumeHeader) {
  const md = markdownIt()
  md.use(container, 'photo', {})
  md.use(container, 'job-row', {})
  if (includeResumeHeader) {
    md.use(container, 'resume-header', {})
  }
  return md
}

const rootDir = __dirname

const DEFAULT_RESUME = 'resumes/default.md'
const DEFAULT_THEME = 'themes/default.css'

function printHelp() {
  console.log(`用法: node generate.mjs [选项]

将 Markdown 简历渲染为 HTML。

选项:
  -r, --resume <path>  简历 Markdown 路径（默认: ${DEFAULT_RESUME}）
  -t, --theme  <path>  主题 CSS 路径（默认: ${DEFAULT_THEME}）
  -o, --out    <path>  输出 HTML 路径（默认: output/{resumeBasename}.html）
  -h, --help           显示此帮助

示例:
  node generate.mjs
  node generate.mjs -r resumes/default.md -t themes/blue.css
  node generate.mjs -r resumes/chen.md -t themes/blue.css -o output/chen.html
  npm run generate -- -t themes/blue.css
`)
}

function parseArgs(argv) {
  const args = { resume: DEFAULT_RESUME, theme: DEFAULT_THEME, out: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      args.help = true
    } else if (arg === '-r' || arg === '--resume') {
      args.resume = argv[++i]
      if (!args.resume) {
        console.error('错误: --resume 需要指定路径')
        process.exit(1)
      }
    } else if (arg === '-t' || arg === '--theme') {
      args.theme = argv[++i]
      if (!args.theme) {
        console.error('错误: --theme 需要指定路径')
        process.exit(1)
      }
    } else if (arg === '-o' || arg === '--out') {
      args.out = argv[++i]
      if (!args.out) {
        console.error('错误: --out 需要指定路径')
        process.exit(1)
      }
    } else {
      console.error(`错误: 未知参数 "${arg}"`)
      console.error('使用 --help 查看用法')
      process.exit(1)
    }
  }
  return args
}

/** @param {string} inputPath @param {'resume' | 'theme'} kind */
function resolveProjectPath(inputPath, kind) {
  const label = kind === 'resume' ? '简历' : '主题'
  if (path.isAbsolute(inputPath) && fs.existsSync(inputPath)) {
    return path.resolve(inputPath)
  }
  const fromCwd = path.resolve(process.cwd(), inputPath)
  if (fs.existsSync(fromCwd)) {
    return fromCwd
  }
  const fromRoot = path.resolve(rootDir, inputPath)
  if (fs.existsSync(fromRoot)) {
    return fromRoot
  }
  console.error(`错误: ${label}文件不存在: ${inputPath}`)
  console.error(`  已尝试: ${fromCwd}`)
  console.error(`         ${fromRoot}`)
  process.exit(1)
}

/** @param {string} inputPath */
function resolveOutputPath(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return path.resolve(inputPath)
  }
  return path.resolve(rootDir, inputPath)
}

function renderResume(markdown, md, mdPhotoOnly, mdInline) {
  let tokens = md.parse(markdown, {})
  tokens = foldResumeHeaderContainers(tokens, markdown, mdPhotoOnly, mdInline)
  tokens = foldJobRowContainers(tokens, markdown, mdInline)
  tokens = foldPhotoContainers(tokens, markdown)
  return md.renderer.render(tokens, md.options, {})
}

function buildHtml(pageTitle, bodyHtml, themeHref) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="stylesheet" href="${themeHref}">
</head>
<body>
  ${bodyHtml}
</body>
</html>
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const resumePath = resolveProjectPath(args.resume, 'resume')
  const themePath = resolveProjectPath(args.theme, 'theme')
  const resumeBasename = path.basename(resumePath, path.extname(resumePath))
  const outDir = path.join(rootDir, 'output')
  const outPath = args.out
    ? resolveOutputPath(args.out)
    : path.join(outDir, `${resumeBasename}.html`)

  const iconSvgByName = loadIconSvgByName(rootDir)
  const installResumeIcons = resumeIconInlinePlugin(iconSvgByName)

  /** 仅用于 job-row 各栏内联，不注册容器，避免嵌套解析问题 */
  const mdInline = markdownIt({ html: false })
  mdInline.use(installResumeIcons)

  const mdPhotoOnly = createMdWithContainers(false)
  mdPhotoOnly.use(installResumeIcons)

  const md = createMdWithContainers(true)
  md.use(installResumeIcons)

  const markdown = fs.readFileSync(resumePath, 'utf8')
  const pageTitle = extractTitle(markdown)
  const html = renderResume(markdown, md, mdPhotoOnly, mdInline)

  const themeHref = path
    .relative(path.dirname(outPath), themePath)
    .split(path.sep)
    .join('/')

  const fullHtml = buildHtml(pageTitle, html, themeHref)

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, fullHtml)

  console.log('✅ 已生成 HTML')
  console.log(`   简历: ${resumePath}`)
  console.log(`   主题: ${themePath}`)
  console.log(`   输出: ${outPath}`)
}

main()
