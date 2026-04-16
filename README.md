# 🦦 海獭账本 (Otter Ledger)

一个简单、纯粹的记账 PWA 应用，数据存储在您的 GitHub 私人仓库中，实现跨设备自动同步。

## ✨ 特性

- 💰 **只记收入** - 专注于收入记录，账户余额自动更新
- 🔄 **GitHub 同步** - 数据存储在您的私人 GitHub 仓库，PC/手机自动同步
- 📱 **PWA 支持** - 可安装到桌面/主屏幕，像原生 App 一样使用
- 🔒 **数据自持** - 数据完全由您掌控，无需第三方服务器
- 💾 **离线可用** - 支持离线记录，联网后自动同步
- 📊 **实时统计** - 总资产一目了然

## 🚀 快速开始

### 1. 创建 GitHub Token

1. 访问 https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 勾选 `repo` 权限（访问仓库）
4. 生成并复制 Token

### 2. 部署应用

#### 方案 A：GitHub Pages（推荐）

1. Fork 本仓库
2. 进入仓库 Settings → Pages
3. Source 选择 Deploy from a branch，分支选 main
4. 访问 `https://你的用户名.github.io/otter-ledger-pwa`

#### 方案 B：Cloudflare Pages

1. Fork 本仓库到您的 GitHub
2. 登录 https://pages.cloudflare.com/
3. 创建新项目，连接 GitHub 仓库
4. 部署完成即可访问

#### 方案 C：Vercel

1. 访问 https://vercel.com/
2. 导入 GitHub 仓库
3. 一键部署

### 3. 首次使用

1. 打开应用网址
2. 点击「使用 GitHub 登录」
3. 输入您的 GitHub Personal Access Token
4. 应用会自动创建一个私人仓库 `otter-ledger-data` 存储您的数据

## 📱 安装到设备

### iOS (Safari)
1. 用 Safari 打开应用网址
2. 点击底部分享按钮
3. 选择「添加到主屏幕」

### Android (Chrome)
1. 用 Chrome 打开应用网址
2. 点击菜单 → 「添加到主屏幕」或「安装应用」

### PC (Chrome/Edge)
1. 打开应用网址
2. 地址栏右侧点击安装图标
3. 或在菜单中选择「安装海獭账本」

## 🔄 数据同步机制

- **首次登录**：从 GitHub 拉取数据，如果不存在则创建初始数据
- **记录收入**：本地保存后自动推送到 GitHub
- **多设备切换**：打开应用时自动从 GitHub 拉取最新数据
- **冲突处理**：以时间戳为准，新的覆盖旧的（简单策略）

## 🛠️ 开发

```bash
# 克隆项目
git clone https://github.com/你的用户名/otter-ledger-pwa.git
cd otter-ledger-pwa

# 本地开发（任意静态服务器）
# Python 3
python -m http.server 8000

# Node.js
npx serve .

# 访问 http://localhost:8000
```

## 📁 文件结构

```
otter-ledger-pwa/
├── index.html      # 主页面
├── app.js          # 核心逻辑
├── sw.js           # Service Worker（PWA）
├── manifest.json   # PWA 配置
├── icons/          # 图标
└── README.md       # 说明文档
```

## 🔐 隐私与安全

- 数据存储在您的 **私人 GitHub 仓库** 中
- 应用仅通过 GitHub API 访问您的仓库
- Token 仅保存在浏览器本地存储中
- 不会上传数据到任何第三方服务器

## 📝 License

MIT License

## 🙏 致谢

- 灵感来自 [Cent](https://github.com/glink25/Cent) - 基于 GitHub 的多人协作记账应用
