### 项目描述

本项目给出一个 Markdown 简历模板，让你专注于内容，无需关注格式。编辑根目录下的 `resume.md`，运行生成脚本即可得到 HTML。

### 安装依赖

请先安装 [Node.js](https://nodejs.org/)（LTS 即可），在项目根目录打开终端，执行：

```
npm install
```

会根据 `package.json` 安装依赖（如 `markdown-it`）。若你使用其他包管理器，亦可：`pnpm install` 或 `yarn`。

### 运行项目

```
node generate.mjs
```

产物路径：`output/resume.html`（样式引用仓库根目录的 `style.css`，请从项目根目录用浏览器打开该 HTML，或本地起一个静态服务器）。

然后打开：

```
output/resume.html
```
在浏览器中，使用 `Ctrl + P` 查看打印效果。