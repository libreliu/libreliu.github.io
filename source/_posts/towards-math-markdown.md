---
title: 让 Hexo 支持内联 LaTeX 数学公式的 Markdown
date: 2022-08-26
---

经过一周多陆陆续续的折腾，到[现在](https://github.com/libreliu/libreliu.github.io/commit/627caa945440bed93a3fe69a90a932a84f7dceb0)本博客基本实现了博客 Markdown 渲染和 Typora, VSCode 等的默认预览中数学公式的表现一致。

> Note: 大于号（`>`）小于号（`<`）目前没有做额外的转义（它们本身是 HTML 标签的结束和开始），但是这个用 `\lt` 和 `\gt` 就行了，所以有点懒得改。
> 
> 如果要改的话，就对 `math` 的处理加上这两个东西的 escape 就好，MathJaX 本身会识别出 `&lt;` 和 `&gt;` 的。

简单来说，我分别魔改了 [marked](https://github.com/libreliu/marked) 和 [hexo-renderer-marked](https://github.com/libreliu/hexo-renderer-marked-math) 两个包，实现了内联 LaTeX 的正确 Tokenize 和 Renderer (i.e. 什么也不做，原样输出)，再由浏览器里运行的 [MathJaX 3](https://github.com/libreliu/libreliu.github.io/commit/9523cf2ec2de2888fee50f2e9925313f96da5a35) 来进行 LaTeX 渲染。

魔改后的版本支持块公式 (block math) `$$ ... $$` 和内联公式 (inline math) `$ ... $`，并且内联公式内部的 `_` 不会和 Markdown 对 `_` 的使用冲突。

下面是渲染 Maxwell 方程组的示例：

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac {\rho} {\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}} {\partial t} \\
\nabla \times \mathbf{B} &= \mu_0\left(\mathbf{J} + \varepsilon_0 \frac{\partial \mathbf{E}} {\partial t} \right) 
\end{aligned}
$$

上面的 $ \mathbf{E} $ 是电场强度，$ \mathbf{B} $ 是磁感应强度，$ \mu_0$ 是真空磁导率，$ \epsilon_0 $ 是真空介电系数。

> `marked` 是 `hexo-renderer-marked` 使用的 Markdown 渲染器，它负责把 Markdown 渲染成 HTML。

## 为什么要新造一个轮子？

Google 一圈，现在有的 Hexo 内联 LaTeX 的方案都不是很让人满意：
1. `hexo-renderer-kramed` 使用的 `kramed` 从 2016 年开始已经没有再更新了
2. `marked` 表示不会加入对 `$ ... $` 和 `$$ ... $$` 的支持 ([markedjs/marked, Issue #722](https://github.com/markedjs/marked/issues/722))
3. `hexo-renderer-pandoc` 需要用户自己安装 `pandoc`，`pandoc` 本身很庞大，并且是 Haskell 编写，本文作者表示改不动；另外，直接 out-of-box 的装上之后，块公式 `pandoc` 总是会多生成 `\[ ... \]` 的 pair，决定弃坑
4. 网络上还存在一些 patch 方案，比如[这里](https://alexsixdegrees.github.io/2017/03/11/letaxinmarkdown/)，直接把 `marked` 的 inline rule 改掉，让其不再将 `_` 作为合法的强调标志（比如 `_asdf_` 之类就不会渲染成 _asdf_ 了）
5. 其实也可以 *摆大烂*，把所有 LaTeX 和 Markdown 冲突的关键字都用反斜杠转义掉

可以看到都不是太优雅。

## 改动简介

> 其实一开始想给 `hexo-renderer-marked` 写插件，但是它只支持 extend `Tokenizer` 和 `Renderer`，把那些乱七八糟规则再写一遍又很难维护，所以最后放弃了这个想法。

主要是对 `marked` 进行改动，让其支持 `$$ .. $$` 和 `$ .. $` 的 Tokenize，并且能无转义的输出。

`marked` 采用正则表达式不断匹配的方式进行词法分析，对于部分块对象会继续进行行内的词法分析。词法分析后的 Toekn 流会送到 Renderer 进行输出。

详细可以看 [libreliu/marked](https://github.com/libreliu/marked) 上面的提交。

由于人比较懒，没有在 npm 上加自己的包，而是直接

```
npm install github:libreliu/hexo-renderer-marked-math#master --save
```

这个的缺点是每次 `npm update hexo-renderer-marked-math` 都要重新拉，并且版本管理上不是很友好。不过只是自己用的话其实无所谓。

## （作为菜鸡）踩过的坑
1. NodeJS 的 `require` 在找不到 `index.js` 时，会去 `package.json` 中查找 `main` 字段，并且加载对应的模块。

   可以注意到，`marked` 的 `main` 是 `./lib/marked.cjs`，这个文件需要运行 `npm run build` 生成。
2. 调试 Promise 链可以采用 Bluebird 的[Promise.longStackTraces()](http://bluebirdjs.com/docs/api/promise.longstacktraces.html)。
