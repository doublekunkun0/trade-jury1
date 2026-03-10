# Upload To GitHub

当前状态

- 本地仓库已初始化
- 首个提交已完成
- 当前分支是 `main`

当前提交

- `258f4b6`

上传步骤

1. 在 GitHub 新建一个空仓库

仓库名建议

`trade-jury`

2. 把下面的命令复制到终端

```bash
cd /Users/mac/Desktop/1
git remote add origin https://github.com/你的用户名/trade-jury.git
git push -u origin main
```

如果你更习惯 SSH

```bash
cd /Users/mac/Desktop/1
git remote add origin git@github.com:你的用户名/trade-jury.git
git push -u origin main
```

建议仓库简介

`An AI trading jury that gets a live quote first and then returns an executable verdict`

建议放到仓库首页的内容

- 首页截图
- 实时报价与裁决截图
- 一个拒绝执行案例
- 一个通过执行案例
- 30 秒演示视频链接

上传前已处理

- `.env.local` 不会被提交
- 运行日志不会被提交
- 本地虚拟环境不会被提交
