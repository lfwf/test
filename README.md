# SoulSync 灵感匹配日记

一个轻量的全栈 Web 应用，帮助用户记录日记、选择匹配偏好并与同频伙伴互阅日记。项目提供邮箱 / 手机验证码登录及微信扫码模拟登录，专注于“日记 + 匹配”这一独特体验。

## 功能亮点

- **多渠道登录**：
  - 邮箱和手机号验证码（开发环境会返回验证码方便调试）。
  - 微信扫码模拟：生成伪二维码、支持轮询确认，方便展示扫码体验。
- **资料管理**：设置昵称、性别、匹配偏好和一句话简介。
- **灵感日记**：
  - 写作心情、标签与“是否共享”开关。
  - 日记列表、共享统计与连续记录天数。
  - 每日灵感提示（内置提示库按日期与用户散列分配）。
- **心动匹配**：
  - 根据双方性别与偏好即时配对。
  - 支持重新匹配 / 重置。
  - 查看匹配对象愿意共享的日记片段。

## 技术栈

- Node.js 原生 `http` 服务，无额外依赖。
- 文件型 JSON 数据存储（`storage/database.json`）。
- 前端使用原生 HTML/CSS/JS，提供响应式界面。
- 自动化测试基于 Node 18+ 自带的 `node:test`。

## 本地运行

```bash
npm install # 无需安装依赖，但可初始化 lock（可选）
npm start   # 启动服务，默认端口 3000
```

访问 `http://localhost:3000` 即可体验前端。

### 测试

```bash
npm test
```

测试覆盖：
- 邮箱 / 手机 / 微信登录流程。
- 日记创建、统计与提示。
- 匹配流程及共享日记。

## 目录结构

```
public/           # 静态前端资源（index.html, app.js, styles.css）
server/           # Node.js 服务端逻辑
  app.js          # 入口与静态资源服务
  api.js          # 路由分发
  controllers/    # 业务模块（auth/profile/diary/match/prompts）
  dataStore.js    # JSON 数据读写
  sessionManager.js # 会话管理
storage/database.json  # 初始数据（内含灵感提示）
tests/            # node:test 用例
```

## 开发笔记

- 所有验证码接口会直接返回验证码，便于调试与自动化测试。
- 会话采用持久化 token（存储于本地文件），前端将 token 保存在 `localStorage`。
- 匹配采用“先到先匹配”策略：当有第二个满足条件的请求时立即配对，否则进入等待队列。
- 微信扫码为模拟实现：
  - 生成伪二维码并轮询 `/api/auth/wechat/poll`。
  - “模拟扫码确认”会调用 `/api/auth/wechat/confirm` 完成登录。

欢迎在此基础上继续扩展 UI 细节或接入真实的第三方服务。Enjoy writing & matching!
