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

### BSDF 适用的渲染方程

$$
\begin{aligned}
L_o(x, \omega_o) &= \int_\Omega f(x, \omega_i, \omega_o) L_i(x, \omega_i) \cos \theta^x_i d \omega_i \\
&= \int_\mathcal{A_i} f(x, \omega_i, \omega_o) L_o(x', \omega_i) \frac{\cos \theta^x_i \cos \theta^{x'}_{o}}{| x - x' |^2} dA \qquad \text{(with light from } x' \text{)} \\
&= \int_\mathcal{A_i} f(x, \omega_i, \omega_o) V(x, x') L_o(x', \omega_i) \frac{\cos \theta^x_i \cos \theta^{x'}_{o}}{| x - x' |^2} dA \\
\end{aligned}
$$

其中 $\theta^x_i$ 为 $x$ 处入射光线与 $x$ 所在表面位置法线所成角度，$\theta^{x'}_o$ 为 $x'$ 处出射光线与 $x'$ 所在表面位置法线所成角度。
$$
V(x, x') := 
\left\{
\begin{aligned}
&1 ,& x' \text{ is visible from } x \\
&0 ,& \text{otherwise}
\end{aligned}
\right.
$$

<!-- 之后可以扩展一节专门讲渲染方程，放到基础回顾部分；现在就略写一下 -->

对于上面的积分，我们希望用一些离散的采样构成的一个估计量来进行原积分的估计。采样方式和利用采样得到的值进行运算从而构造估计量的方式被称为一种估计方法。

数理统计告诉我们，估计量也是满足一个分布的，在绝大多数时候我们通过估计量的**期望**和**方差**来衡量一个估计的好坏。

既然本篇论文是关于采样方法的改进，那么就首先回顾一下 Monte Carlo 求解渲染方程时会使用到的估计方法。

### 简单随机抽样

假设我们需要估计
$$
I := \int_\Omega f(x) dx
$$

的值，并且我们可以**等概率**且**独立**的从 $\Omega$ 中抽取样本 $\{X_i\}_{i=1}^n$，那么我们就可以构造估计量 $\bar I$
$$
\bar I := \frac{1}{N} \sum_{i=1}^n f(X_i)
$$

既然 $X_i$ 是随机变量，那么我们的估计量自然也是个随机变量，它的期望 $\operatorname{E}[\bar I]$ 是
$$
\begin{aligned}
\operatorname{E}[\bar I] &= \frac{1}{N} \sum_{i=1}^n \operatorname{E}[f(X_i)] \\
&= \operatorname{E}[f(X_1)] & \text{(} \{X_i\} \text{ satisfy i.i.d.)} \\
&= \int_\Omega f(X_1) dX_1 \\
&= I
\end{aligned}
$$

> Note: 形如
> $$
> \int_\Omega f(X) dX 
> $$
> 的积分是表示在 $\Omega$ 这个空间的积分，这个空间如果比如想 (局部) 变换到平直的 $\mathbb{R}^3$ 那就需要乘上一个 Jacobian，在一维的时候就是 $\int f(x) g(x) dx$ （假设 $X$ 出现的**概率**是 $g(x)$）
>
> 总之，只要想象连续就是离散情况的细分，一般就都能推对。

<!-- TODO: 看下概率论课本是怎么用测度 (?) 把这件事说的更明白的 -->

所以积分最终会收敛，但是估计量 $\bar I$ 的方差依赖于 $f(x)$ 本身的性质：
$$
\begin{aligned}
\operatorname{Var}[\bar I] &= \frac{1}{N^2} \operatorname{Var} \left[ \sum_{i=1}^{n} f(X_i) \right] \\
&= \frac{1}{N} \operatorname{Var}[f(X_1)] \\
&= \frac{1}{N} \left( \operatorname{E}[f(X_1)^2] - I^2 \right) \\
&= \frac{1}{N} \left[ \int_\Omega f(X^2) \, dX - \left( \int_\Omega f(X) \, dX \right)^2 \right]
\end{aligned}
$$

<!-- https://math.stackexchange.com/questions/1386113/proving-that-the-variance-is-non-negative -->

<!-- TODO: 补一些 Var 的图 -->
<!-- 写一个 browser-side 画函数的工具？(大坑) -->

> Note: 
> 1. $Var[X] = E[(X-E[X])^2] = E[X^2-2 \cdot X \cdot E[X] + (E[X])^2] = E[X^2]-(E[X])^2$ 
> 2. $\operatorname{Var}[aX+bY] = a^2\operatorname{Var}[X] + b^2\operatorname{Var}[Y] + 2ab \operatorname{Cov}[X, Y]$

### Importance Sampling (重要性采样)

按分布 $p(x)$ 采样得到 $x$，然后进行 Monte Carlo 积分

方法：
$$
\int_\Omega f(𝑥) dx \approx \frac{1}{N} \sum \frac{f(𝑥_𝑖)}{𝑝(𝑥_𝑖)} \\

s.t.  \quad p(x) > 0\ \text{for}\ x \in supp(f)
$$

可以证明，如果分布 p 对 f 近似的越好，相同样本数量下估计量的方差越低，并且方差可以渐进的到达 0，即 “asymptotic zero-variance estimation”

### Resampled Importance Sampling

