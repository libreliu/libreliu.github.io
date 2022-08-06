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

的值，并且我们可以**等概率**且**独立**的从 $\Omega$ 中抽取样本 $\{x_i\}_{i=1}^n$，那么我们就可以构造估计量 $\bar I$
$$
\bar I := \frac{|\Omega|}{N} \sum_{i=1}^n f(x_i)
$$

既然 $X_i$ 是随机变量，那么我们的估计量自然也是个随机变量，它的期望 $\operatorname{E}[\bar I]$ 是
$$
\begin{aligned}
\operatorname{E}[\bar I] &= \frac{|\Omega|}{N} \sum_{i=1}^n \operatorname{E}[f(X_i)] \\
&= |\Omega| \operatorname{E}[f(x_1)] & \text{(} \{X_i\} \text{ satisfy i.i.d.)} \\
&= |\Omega| \int_\Omega f(x) d \mu(x) \\
&= |\Omega| \int_\Omega f(x) \mu(x) dx \\
&= |\Omega| \int_\Omega f(x) \frac{1}{|\Omega|} dx \\
&= I
\end{aligned}
$$

> Note: 形如
> $$
> \int_\Omega f(x) d\mu(x) 
> $$
> 的积分中，$\mu(x)$ 是随机变量 $X$ 所对应的概率密度函数，在这里是均匀分布所以 $\mu(x) = 1/|\Omega|$ 。期望的本质就是 “$\sum x \times p(x)$”

<!-- 
比如说我们在初等概率论中学到的随机变量，在测度论角度来讲就是一种可测函数，而初等概率论在很多计算上面是直接在取值空间进行计算的，也就是实数空间，它的很多积分的运算你放在测度论来看就是直接应用了积分变换定理。在概率论中提到的“分布”，其实就是根据这个随机变量（可测函数）在原空间和取值空间进行一个测度变换，站在这个角度去看待一些概率论问题就会感觉一切是那么合理，简直就是一种艺术。

作者：再熬夜是猪
链接：https://www.zhihu.com/question/29800166/answer/1884856359
来源：知乎
著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。
-->

所以积分最终会收敛，但是估计量 $\bar I$ 的方差依赖于 $f(x)$ 本身的性质：
$$
\begin{aligned}
\operatorname{Var}[\bar I] &= \frac{|\Omega|^2}{N^2} \operatorname{Var} \left[ \sum_{i=1}^{n} f(x_i) \right] \\
&= \frac{|\Omega|}{N} \operatorname{Var}[f(x)] \\
&= \frac{|\Omega|}{N} \left( \operatorname{E}[f(x)^2] - I^2 \right) \\
&= \frac{|\Omega|}{N} \left[ \int_\Omega f(x^2) \mu(x) dx - \left( \int_\Omega f(x) \mu(x) dx \right)^2 \right] \\
&= \frac{1}{N} \left[ \int_\Omega f(x^2) dx - \frac{1}{|\Omega|}\left( \int_\Omega f(x) dx \right)^2 \right]
\end{aligned}
$$

我们观察到，后面的方括号中的内容和抽样次数 N 无关，所以只要 $\operatorname{Var}[f(X_i)]$ 有限，即可获得在方差意义上收敛的原函数。

<!-- https://math.stackexchange.com/questions/1386113/proving-that-the-variance-is-non-negative -->

<!-- TODO: 补一些 Var 的图 -->
<!-- 写一个 browser-side 画函数的工具？(大坑) -->

> Note: 
> 1. $Var[X] = E[(X-E[X])^2] = E[X^2-2 \cdot X \cdot E[X] + (E[X])^2] = E[X^2]-(E[X])^2$ 
> 2. $\operatorname{Var}[aX+bY] = a^2\operatorname{Var}[X] + b^2\operatorname{Var}[Y] + 2ab \operatorname{Cov}[X, Y]$
> 3. 如果很严谨，还应该讨论函数具有何种性质时，方差意义上收敛的两个函数是同一个函数。（~~不过我不会~~）

### Importance Sampling (重要性采样)

仍然假设我们需要估计
$$
I := \int_\Omega f(x) dx
$$

但是这次，我们选择一个连续分布，记其概率密度函数为 $p(x)$，并且我们从该分布中抽样得到样本 ${x_i}_{i=1}^N$，我们用这些样本构造估计量 $\bar I$
$$
\bar I := \frac{1}{N} \sum_{i=1}^n \frac{f(x_i)}{p(x_i)}
$$

那么，
$$
\begin{aligned}
\operatorname{E}[\bar I] &= \operatorname{E}\left[\frac{f(x_1)}{p(x_1)}\right] \\
&= \int_\Omega \frac{f(x)}{p(x)} p(x) dx \\
&= \int_\Omega f(x) dx \\
&= I

\end{aligned}
$$

> 此处的推导隐含 $p(x)$ 在 $\Omega$ 上的值**非零**，考虑到 $p(x)$ 是概率密度函数，$p(x) > 0$
> 
> 不过事实上我们只需要 $p(x) > 0$ 在 $\operatorname{supp}(f)$ 成立即可。

方差：
$$

$$

TODO

<!-- 可以证明，如果分布 p 对 f 近似的越好，相同样本数量下估计量的方差越低，并且方差可以渐进的到达 0，即 “asymptotic zero-variance estimation” -->

### Resampled Importance Sampling

从前面的 Importance Sampling 方法中我们了解到，我们采样的分布 $p(x)$ 的形状越接近 $f(x)$，那么采样的效果就越好。

如果我们有一个很棒的分布 $q(x)$，但是我们很难直接采样出符合 $q(x)$ 分布的样本，但与此同时我们有一个劣化版本 $p(x)$ 可以进行直接采样。

此时，我们可以采用如下方法，采样出符合 $q(x)$ 分布的样本：
1. 从 p(x) 分布中采样