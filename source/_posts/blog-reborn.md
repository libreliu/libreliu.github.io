---
title: 博客复活！
---

之前的博客已经有一段时间没更新了，以至于竟然连之前的源文件都找不到了。

这次将博客的源文件放到 GitHub 上，并且把之前的文章收集整理一下，进行一下重构。

## 用什么博客框架？

在 Hexo 和 Pelican 中选择了 Hexo，主要社区和主题的维护者都更活跃一些。

## 常用命令

### 生成 & 测试

```
./node_modules/.bin/hexo generate
./node_modules/.bin/hexo server
```

也可以考虑 `npm run build` 和 `npm run server`。

### 新文章

`hexo new "My new post"`

## 修改主题

主题基于 [BlairOS](https://github.com/52binge/hexo-theme-blairos) 这个 Hexo 主题，我裁减了其中的统计代码，更改了 Logo 和相关的 Stylus 代码。

### 已知问题

- 计划在将来把对 cdn.mathjax.org 的依赖也去掉，变成完全服务端渲染
- 这个模板对 ul 嵌套的情况渲染不正确