### 项目描述

本项目给出一个 Markdown 简历模板，让你专注于内容，无需关注格式。编辑 `resumes/default.md`（或新建如 `resumes/chen.md`），运行生成脚本即可得到 HTML。

> 如果你稍微了解代码，可以手动修改css样式来调整，甚至自定义语法。

### 安装依赖

请先安装 [Node.js](https://nodejs.org/)（LTS 即可），在项目根目录打开终端，执行：

```
npm install
```

会根据 `package.json` 安装依赖（如 `markdown-it`）。若你使用其他包管理器，亦可：`pnpm install` 或 `yarn`。

### 运行项目

默认使用 `resumes/default.md` 与 `themes/default.css`，生成 `output/default.html`：

```
node generate.mjs
```

或使用 npm script：

```
npm run generate
```

**常用参数：**

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--resume` | `-r` | `resumes/default.md` | 简历 Markdown 路径 |
| `--theme` | `-t` | `themes/default.css` | 主题 CSS 路径 |
| `--out` | `-o` | `output/{basename}.html` | 输出 HTML 路径 |
| `--help` | `-h` | — | 显示帮助 |

示例：

```
# 使用蓝主题
node generate.mjs -t themes/blue.css

# 指定简历与输出路径（resumes/chen.md → output/chen.html）
node generate.mjs -r resumes/chen.md -t themes/blue.css

# 通过 npm 传参
npm run generate -- -t themes/blue.css
```

产物命名规则：`resumes/chen.md` 默认生成 `output/chen.html`。HTML 中通过相对路径引用所选主题 CSS，请从项目根目录用浏览器打开该 HTML，或本地起一个静态服务器。

然后打开：

```
output/default.html
```

在浏览器中，使用 `Ctrl + P` 查看打印效果。

### 切换主题

项目提供多套完整样式，位于 `themes/` 目录。生成时通过 `-t` / `--theme` 指定主题即可，无需覆盖根目录 `style.css`：

| 文件 | 说明 |
|------|------|
| `themes/default.css` | 默认样式 |
| `themes/blue.css` | 木及「蓝」主题（主题色 `89,116,212`、章节蓝线、`#747474` 正文） |

```
node generate.mjs -t themes/blue.css
```

然后打开 `output/default.html` 查看效果。
