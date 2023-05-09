---
layout: 'paper-reading'
title: '论文阅读 | 利用对象层次结构的数据并行路径追踪'
date: 2023-05-09
papertitle: 'Data Parallel Path Tracing with Object Hierarchies'
paperauthors: Ingo Wald, Steven G. Parker
papersource: 'HPG 2022'
paperurl: 'https://dl.acm.org/doi/abs/10.1145/3543861'
status: Working
---

本文提出了一种同时支持空间和对象层次结构两种划分方式的，新的场景数据划分方法。同时，利用多种减少数据通信的策略，本文的方法可以同时实现降低通信开销、降低内存占用、增加性能的目标，进而可以实现在相对低端的互联网络上实现 interactive 级别的渲染性能。