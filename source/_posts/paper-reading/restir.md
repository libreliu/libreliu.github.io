---
layout: 'paper-reading'
title: '论文阅读 | ReSTIR'
date: 2022-07-03
papertitle: 'Spatiotemporal reservoir resampling for real-time ray tracing with dynamic direct lighting'
paperauthors: Benedikt Bitterli, Chris Wyman, Matt Pharr, Peter Shirley, Aaron Lefohn, Wojciech Jarosz
papersource: 'SIGGRAPH 2020'
paperurl: 'https://cs.dartmouth.edu/wjarosz/publications/bitterli20spatiotemporal.html'
status: Working
---

## 简介

本篇文章主要介绍了 ReSTIR 这种用于实时渲染的采样增强方法，该方法可以处理交互式渲染中对大量光源 (>= 1k) 的直接光进行采样的问题，也可以用于实时渲染。

> 注：本篇文章的官方 Slides 我感觉做的很不错，可以在他们的项目主页下载到。

## 背景

### Importance Sampling (重要性采样)

按分布 $p(x)$ 采样得到 $x$，然后进行 Monte Carlo 积分

方法：
$$
\int_\Omega f(𝑥) dx \approx \frac{1}{N} \sum \frac{f(𝑥_𝑖)}{𝑝(𝑥_𝑖)} \\

s.t.  \quad p(x) > 0\ \text{for}\ x \in supp(f)
$$

可以证明，如果分布 p 对 f 近似的越好，相同样本数量下估计量的方差越低，并且方差可以渐进的到达 0，即 “asymptotic zero-variance estimation”

### Resampled Importance Sampling

