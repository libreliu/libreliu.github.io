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
&= \int_\mathcal{A_i} f(x, \omega_i, \omega_o) L_o(x', \omega_i) \frac{\cos \theta^x_i \cos \theta^{x'}_{o} }{| x - x' |^2} dA \qquad \text{(with light from } x' \text{)} \\
&= \int_\mathcal{A_i} f(x, \omega_i, \omega_o) V(x, x') L_o(x', \omega_i) \frac{\cos \theta^x_i \cos \theta^{x'}_{o} }{| x - x' |^2} dA \\
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
&= \frac{|\Omega|^2}{N} \operatorname{Var}[f(x)] \\
&= \frac{|\Omega|^2}{N} \left( \operatorname{E}[f(x)^2] - \operatorname{E}[f(x)]^2 \right) \\
&= \frac{|\Omega|^2}{N} \left[ \int_\Omega f(x)^2 \mu(x) dx - \left( \int_\Omega f(x) \mu(x) dx \right)^2 \right] \\
&= \frac{1}{N} \left[ |\Omega| \int_\Omega f(x)^2 dx - \left( \int_\Omega f(x) dx \right)^2 \right]
\end{aligned}
$$

我们观察到，后面的方括号中的内容和抽样次数 N 无关，所以只要 $\operatorname{Var}[f(X_i)]$ 有限，即可说明增加抽样次数，估计量最终可以**在方差意义上**收敛到原函数。

<!-- https://math.stackexchange.com/questions/1386113/proving-that-the-variance-is-non-negative -->

<!-- TODO: 补一些 Var 的图 -->
<!-- 写一个 browser-side 画函数的工具？(大坑) -->

> Note: 
> 1. $\operatorname{Var}[X] = \operatorname{E}[(X-\operatorname{E}[X])^2] = \operatorname{E}[X^2-2 \cdot X \cdot \operatorname{E}[X] + (\operatorname{E}[X])^2] = \operatorname{E}[X^2]-(\operatorname{E}[X])^2$ 
> 2. $\operatorname{Var}[aX+bY] = a^2\operatorname{Var}[X] + b^2\operatorname{Var}[Y] + 2ab \operatorname{Cov}[X, Y]$
> 3. 如果很严谨，还应该讨论函数具有何种性质时，方差意义上收敛的两个函数是同一个函数。（~~不过我不会~~）

### 重要性采样 (Importance Sampling)

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
\begin{aligned}
\operatorname{Var}[\bar I]
&= \frac{1}{N^2} \operatorname{Var}\left[ \sum_{i=1}^n \frac{f(x_i)}{p(x_i)} \right] \\
&= \frac{1}{N} \operatorname{Var}\left[ \frac{f(x)}{p(x)} \right] \\
&= \frac{1}{N} \left( \operatorname{E}\left[\left[\frac{f(x)}{p(x)}\right]^2\right] - \operatorname{E}\left[\frac{f(x)}{p(x)}\right]^2  \right) \\
&= \frac{1}{N} \left[ \int_\Omega \left(\frac{f(x)}{p(x)}\right)^2 p(x) dx - \left( \int_\Omega \frac{f(x)}{p(x)} p(x) dx \right)^2 \right] \\
&= \frac{1}{N} \left[ \int_\Omega \frac{f(x)^2}{p(x)} dx - \left( \int_\Omega f(x) dx \right)^2 \right] \\
\end{aligned}
$$

则加大 N 后方差可以渐进趋于 0。

如果我们可以找到概率密度函数 $p(x)$ 满足
$$
p(x) = \frac{f(x)}{\int_\Omega f(t) \, dt}
$$

的话，带入上面的式子可以得到

$$
\begin{aligned}
\operatorname{Var}[\bar I]
&= \frac{1}{N} \left[ \left(\int_\Omega f(x) dx\right)^2 - \left( \int_\Omega f(x) dx \right)^2 \right] = 0
\end{aligned}
$$

一般的，由 $p(x)$ 决定的分布对 $f(x)$ 近似的越好，相同样本数量下估计量的方差就会越低。

### 重采样重要性采样 (Resampled Importance Sampling)

从前面的重要性采样方法中我们了解到，我们采样的 $p(x)$ 的形状越接近 $f(x)$，那么采样的效果就越好。

> 所谓形状接近，就是函数贴近 ${f(x)}/{\int_\Omega f(t) \, dt}$。

如果我们有一个很棒的分布 $\hat p(x)$，他比较接近 $f(x)$ 的形状，但是我们没法直接采样出符合 $\hat p(x)$ 分布的样本。

*(1-sample RIS)* 假设我们此时还可以找到一个分布 $p(x)$，其与 $\hat p(x)$ 比较接近，那么此时，我们可以采用如下方法，采样出符合 $ \hat p(x)$ 分布的样本：
1. 从 $p(x)$ 分布中抽样得到集合 $ X = \{x_1, ..., x_M \} $
2. 按如下所给的条件概率抽样一个**索引** $ z \in \{1, ..., M\} $
   $$
   p(z \, | \, x_1, ..., x_M) = \frac{w(x_z)}{\sum_{i=1}^M w(x_i)} \quad \text{with} \quad w(x) = \frac{\hat p(x)}{p(x)}
   $$
3. 按下式计算估计量
   $$
   \begin{aligned}
   \bar I^{1, M}_{ris}(z, x_1, ..., x_M) = \frac{f(x_z)}{\hat p(x_z)} \cdot \left( \frac{1}{M} \sum^M_{j=1} w(x_j) \right)
   \end{aligned}
   $$

首先，我们需要证明这个方法正确。证明的核心在于计算两步抽样最终抽到 $ x_z $ 的概率。记

$$
p(z_0, x_z) := \lim_{\epsilon \to 0} P(z = z_0,  x_z \le x \le x_z + \epsilon) / \epsilon
$$

则

$$
p(z, x_1, ..., x_M) = p(z \, | \, x_1, ..., x_M) \prod_{i=1}^M p(x_i) = \frac{ {\hat p(x_z)}/{p(x_z)} }{\sum_{i=1}^M \left({\hat p(x_i)}/{p(x_i)}\right)} \prod_{j=1}^M p(x_j)
$$

则

$$
\begin{aligned}
\operatorname{E}\left[\bar I^{1, M}_{ris}\right]
&= \int_{x_1, ..., x_M} \sum_{z=1}^M \bar I^{1, M}_{ris}(z, x_1, ..., x_M) \, p(z \, | \, x_1, ..., x_M) \left( \prod_{i=1}^M p(x_i) \right) \, dx_1 ... dx_M \\
&= \int_{x_1, ..., x_M} \sum_{z=1}^M \frac{f(x_z)}{\hat p(x_z)} \cdot \left( \frac{1}{M} \sum^M_{j=1} w(x_j) \right) \frac{ {\hat p(x_z)}/{p(x_z)} }{\sum_{j=1}^M w(x_j)} \left( \prod_{i=1}^M p(x_i) \right) \, dx_1 ... dx_M \\
&= \frac{1}{M} \int_{x_1, ..., x_M} \sum_{z=1}^M \frac{f(x_z)}{p(x_z)} \left( \prod_{i=1}^M p(x_i) \right) \, dx_1 ... dx_M \\
&= \frac{1}{M} \operatorname{E}\left[ \sum_{z=1}^{M} \frac{f(x_z)}{p(x_z)} \right] \\
&= \operatorname{E}\left[ \frac{f(x)}{p(x)} \right] \qquad \text{(} \because x_i \text{ i.i.d.)} \\
&= \int_\Omega f(x) \, dx
\end{aligned}
$$

> NOTE: 
> 1. $ \int_{x_1, ..., x_M} $ 和 $ \int_{\mathcal{\Omega}^M} $ 是一样的，是他们各自的空间 $ \Omega $ 的直积。
> 2. $ \operatorname{E}[X+Y] = \operatorname{E}[X] + \operatorname{E}[Y] $ 不依赖于 $ X $ 和 $ Y $ 独立。

<!-- TODO: 补充个 2 的证明 -->

方差也可以相应计算如下：

$$
\begin{aligned}
\operatorname{Var}\left[\bar I^{1, M}_{ris}\right]
&= \frac{1}{M^2} \operatorname{Var}\left[ \frac{f(x_z)}{\hat p(x_z)} \cdot \left(  \sum^M_{j=1} w(x_j) \right) \right] \\
&= ?
\end{aligned}
$$

<!-- TODO: Multi-sample RIS -->

### 带权蓄水池抽样 (Weighted Reservoir Sampling)

前面提到，重采样重要性采样需要先抽 $ M $ 个样本，然后从中再抽样出最终的值。

经过仔细观察，拥有如下结构的抽样问题可以用带权蓄水池抽样 (Weighted Reservoir Sampling) 来解决：

$$
p(z \, | \, x_1, ..., x_M) = \frac{w(x_z)}{\sum_{i=1}^M w(x_i)}
$$

(WRS) 假设对于序列 $ \{x_1, ..., x_m\} $，我们希望按上述概率抽样得到样本 $x_z$
1. 维护一个当前总权重 $ w_\text{sum} $，当前总样本数 $ M $ 和最终样本 $ y $
2. 初始化 $ y:=x_1; \, M:=1; \, w_\text{sum}:=w(x_1) $
3. 对于每个新样本 $x_i$
   - 以 $ w(x_i) / w_\text{sum} $ 概率：$ y:=x_i; \, M:=M+1; \, w_\text{sum} := w_\text{sum}+w(x_i) $
   - 以 $ 1 - w(x_i) / w_\text{sum} $ 概率：$ M:=M+1; \, w_\text{sum} := w_\text{sum}+w(x_i) $

这样对于某个样本 $ x_k $，经过这个过程最后被选中的概率为 `P(第 k 次被选中) * P(第 k 次之后都没有被换掉)`，乘起来很容易证明正确性。

WRS 方法的优势在于，不需要完成存储 $ \{x_i\} $ 序列本身，而是线性扫描一遍这个序列就可以得出结果，非常适合和前面的 RIS 方法搭配使用。
### 蓄水池合并 (Reservoir Merging)

<!-- 假设我们要从 $ \{x_1, ..., x_m, y_1, ..., y_n\} $ 中抽样， -->