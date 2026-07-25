# E-Account：部署到 iPhone 使用

这个项目已经准备好 PWA 文件：`manifest.webmanifest`、`service-worker.js` 和 `icons/`。iPhone 不能直接从 ChatGPT 安装网页应用，需要先把这个文件夹部署到 HTTPS 地址。

## 方式一：GitHub Pages

1. 新建一个 GitHub 仓库，例如 `e-account`。
2. 上传本文件夹内的所有文件：`index.html`、`styles.css`、`app.js`、`manifest.webmanifest`、`service-worker.js`、`icons/`。
3. 在 GitHub 仓库页面进入 `Settings` → `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main` / `/root`，保存。
6. 等待 GitHub 给出 `https://你的用户名.github.io/e-account/`。

## 方式二：Netlify

1. 打开 https://app.netlify.com/drop 。
2. 把整个 `Elliot的记账APP` 文件夹拖进去。
3. Netlify 会生成一个 HTTPS 网址。

## 添加到 iPhone 主屏幕

1. 在 iPhone 上用 Safari 打开部署后的 HTTPS 网址。
2. 点击底部分享按钮。
3. 选择“添加到主屏幕”。
4. 名称建议填：`E-Account`。
5. 以后从主屏幕图标打开，会以独立 App 窗口运行。

## 数据说明

数据仍保存在当前设备浏览器本地。Mac 和 iPhone 不会自动同步。换设备或重装前，请在“备份”页面导出 JSON，再到另一台设备导入。
