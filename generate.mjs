import fs from 'fs'
import markdownIt from 'markdown-it'
import container from 'markdown-it-container'

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
  const mainHtml = renderMarkdownFolded(mdPhoto, mdInline, left)
  return `<div class="resume-header"><div class="resume-header__main">${mainHtml}</div>${photoHtml}</div>`
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

/** 仅用于 job-row 各栏内联，不注册容器，避免嵌套解析问题 */
const mdInline = markdownIt({ html: false })

const mdPhotoOnly = createMdWithContainers(false)
const md = createMdWithContainers(true)

const markdown = fs.readFileSync('./resume.md', 'utf8')
const pageTitle = extractTitle(markdown)

let tokens = md.parse(markdown, {})
tokens = foldResumeHeaderContainers(tokens, markdown, mdPhotoOnly, mdInline)
tokens = foldJobRowContainers(tokens, markdown, mdInline)
tokens = foldPhotoContainers(tokens, markdown)
const html = md.renderer.render(tokens, md.options, {})

const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  ${html}
</body>
</html>
`

fs.mkdirSync('./output', { recursive: true })
fs.writeFileSync('./output/resume.html', fullHtml)

console.log('✅ 已生成 output/resume.html')
