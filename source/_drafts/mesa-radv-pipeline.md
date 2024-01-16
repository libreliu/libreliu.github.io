---
title: "Mesa radv 源码阅读（二）: Pipeline 编译"
date: 2024-01-11
---

在一种代码之中，图形/计算管线 (Graphics / Compute Pipeline) 相关的代码比较吸引笔者。原因也很简单：这部分直接处理了输入的 Shader 和其它管线状态到最终的 PSO (Pipeline State Object) 的编译工作，仔细向下挖我们甚至可以看到 native ISA 的相关结构。

