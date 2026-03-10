# Trade Jury

Trade Jury 是一个面向链上交易的 AI 决策产品

它不直接把用户推向成交
而是在交易前先完成一次结构化判断

输入一句自然语言交易意图之后
系统会先拿报价
再让多个角色分别审查趋势 风险 执行质量和拥挤度
最后只输出三种结果

- 通过执行
- 条件通过
- 拒绝执行

## 为什么做这个产品

真实交易里最贵的错误
通常不是不会下单
而是在不该做的时候做了

Trade Jury 想解决的就是这一步

- 追高时是否应该拦住
- 防守轮动时是否应该立即执行
- 抄底时是否只能小仓位试单
- 路径能成交和交易值得成交是不是一回事

## 产品结构

- 自然语言输入交易意图
- 实时报价面板返回到手额 成本和路径结构
- 多角色陪审团分别给出观点
- 风险层保留否决权
- 最终输出裁决 建议仓位和执行建议

## 当前版本

当前本地 demo 已完成以下闭环

- Base 链实时 quote 拉取
- 交易裁决和仓位建议
- 三类典型场景切换
- 可展示的产品页和本地 API 服务

服务会优先尝试 OKX DEX quote
如果当前 API 权限或网络不可用
会自动回退到备用实时聚合报价

## 本地运行

运行以下命令

```bash
/Users/mac/Desktop/1/start_demo.sh
```

然后打开

`http://127.0.0.1:4173/index.html`

停止服务

```bash
/Users/mac/Desktop/1/stop_demo.sh
```

## 环境变量

复制 `/Users/mac/Desktop/1/.env.example` 为 `.env.local`
然后填写

- `OKX_DEX_API_KEY`
- `OKX_DEX_SECRET_KEY`
- `OKX_DEX_PASSPHRASE`

## 文件说明

- `/Users/mac/Desktop/1/index.html` 产品页
- `/Users/mac/Desktop/1/styles.css` 页面样式
- `/Users/mac/Desktop/1/app.js` 前端交互
- `/Users/mac/Desktop/1/server.js` 本地 API 与 quote 聚合
- `/Users/mac/Desktop/1/submission/` 投稿材料
