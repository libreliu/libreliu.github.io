---
layout: 'paper-reading'
title: '论文阅读 | 连续多重重要性采样'
date: 2022-11-05
papertitle: 'Continuous Multiple Importance Sampling'
paperauthors: Rex West, Iliyan Georgiev, Adrien Gruson, Toshiya Hachisuka
papersource: 'SIGGRAPH 2020'
paperurl: 'http://iliyan.com/publications/ContinuousMIS'
status: Working
---

## 简介

本篇文章扩展了 Veach 在 1995 年提出的、用于 Monte Carlo 多重重要性采样 (Multiple Importance Sampling)，将其推广到了具有**无限**的**连续**采样策略的情况。


## 多重重要性采样 (MIS)

> 本方法比较详细的讨论可以参考 *Optimally Combining Sampling Techniques
for Monte Carlo Rendering* 这篇 SIGGRAPH'95 的论文，是 Veach 和 Guibas 很高引用的文章之一。
> 
> 也可以参考 [Importance Sampling | PBR Book 3rd](https://www.pbr-book.org/3ed-2018/Monte_Carlo_Integration/Importance_Sampling)，不过里面没有证明。


对于积分

$$
I = \int_\Omega f(x) dx
$$

我们希望用 Monte Carlo 采样的方法进行积分值的估计。

多重重要性采样 (Multiple Importance Sampling, MIS) 的大致思路如下：有 $ m $ 个采样策略，每个采样策略都可以对样本空间 $ \Omega $ 进行采样，并且每种策略都有概率密度函数 $ p_i(x) $。

对于 Multi-sample MIS，要分别使用每种采样策略**独立**采样 $ n_i $ 次，获得总计 $ \sum_{i=1}^{m} n_i $ 个采样，然后使用如下的式子进行积分的估计：

$$
\langle I \rangle_{mis} = \sum_{i=1}^m \frac{1}{n_i} \sum_{j=1}^{n_i} \frac{w_i(x_{i,j}) f(x_{i, j})}{p_i(x_{i,j})}
$$

其中 $ x_{i, j} $ 表示第 $ i $ 个采样策略第 $ j $ 次采样获得的值，$ w_i(x) $ 为 $ m $ 个与 MIS 相关的权重函数。

首先可以证明，这 $ m $ 个权重函数只要满足 $ \sum_{i=1}^m w_i(x) = 1 $，那么 $ \langle I \rangle_{mis} $ 就是无偏的：

$$
\begin{aligned}
\operatorname{E}[\langle I \rangle_{mis}] &= \operatorname{E}\left[ \sum_{i=1}^m \frac{1}{n_i} \sum_{j=1}^{n_i} \frac{w_i(x_{i,j}) f(x_{i, j})}{p_i(x_{i,j})} \right] \\
&= \sum_{i=1}^m \frac{1}{n_i} \operatorname{E}\left[ \sum_{j=1}^{n_i} \frac{w_i(x_{i,j}) f(x_{i, j})}{p_i(x_{i,j})} \right] \\
&= \sum_{i=1}^m \operatorname{E}\left[ \frac{w_i(x_{i,1}) f(x_{i, 1})}{p_i(x_{i,1})} \right] \quad (\because \text{i.i.d})\\
&= \sum_{i=1}^m \int_\Omega \frac{w_i(x) f(x)}{p_i(x)} p_i(x) dx \\
&= \sum_{i=1}^m \int_\Omega w_i(x) f(x) dx \\
&= \int_\Omega \sum_{i=1}^m w_i(x) f(x) dx \\
&= \int_\Omega f(x) dx \\
&= I
\end{aligned}
$$

那么，哪样的权重会让估计量的方差比较小呢？Veach 和 Guibas 在其论文中，给出了被称为 **Balance Heuristic** 的估计量：

$$
\hat w_i (x) = \frac{c_i p_i(x)}{\sum_{j=1}^m c_j p_j(x)} \quad \text{where}\ c_i = n_i / \sum_{j=1}^{m} n_j 
$$

并且他们证明了，使用 $ \{ \hat w_i(x) \}_{i=1}^m $ 作为权重函数构造的估计量 $ \langle \hat I_{mis} \rangle $ 和**任意的**权重函数构造的估计量 $ \langle I_{mis} \rangle $ 的方差满足下面的关系：

$$
\operatorname{V}[\langle \hat I \rangle_{mis}] \le \operatorname{V}[\langle I \rangle_{mis}] + \left( \frac{1}{\min_i n_i} - \frac{1}{\sum_i n_i} \right) I^2 
$$

这其实在说，Balance Heuristic 从渐进意义上来说是方差比较低的估计。

有的时候，我们只希望采样一次。这种情况下，我们可以首先以 $P(t=i)$ 的概率去采样我们将要使用的采样方法 $t$，然后再使用 MIS 积分估计量：

$$
\langle I \rangle_{mis} = \frac{w_t(x_{t,1}) f(x_{t,1})}{p_t(x_{t,1}) P(t=i)}
$$

其中 $ p_t(x_{t,1}) $ 表示采样方法为 $ t $ 情况下抽样到 $ x_{t,1} $ 的条件概率。

Veach 的论文中证明，Balance Heuristic 在任何 One-sample MIS 的情形下都是最优的权重组合。

## 连续多重重要性采样 (Continuous MIS)

West 等人将上面的工作进行了进一步的推广：如果现在有连续的无限多种采样策略，那么也可以将 MIS 中的估计量进行推广，得到**连续多重重要性采样** (Continuous Multiple Importance Sampling, CMIS)。

定义采样方法空间 $ \mathcal{T} $，在其上的每个元素 $ t \in \mathcal{T} $ 都是一种采样策略。

那么自然可以想到，将 $ w_i(x) $ 推广为一个 $ \mathcal{T} \times \mathcal{X} \to \mathrm{R} $ 的函数 $ w(t, x) $，归一化条件 $ \sum_i w_i(x) = 1 $ 推广为 $ \int_\mathcal{T} w(t, x) dt = 1 $。

类似的，可以定义 One-sample CMIS 积分估计量

$$
\langle I \rangle_{CMIS} = \frac{w(t, x)f(x)}{p(t, x)} = \frac{w(t, x)f(x)}{p(t) p(x|t)}
$$

其中 $ p(t) $ 是选择策略 $ t $ 的概率密度， $ p(x|t) $ 是在策略 $ t $ 下采样得到 $ x $ 的条件概率。

同时，只要满足如下两个条件，上面的估计量就是无偏的：

1. $ \int_\mathcal{T} w(t, x) dt = 1 $ 对任何 $ x \in \operatorname{supp} f(x) $ 成立
2. 当 $ p(t, x) = 0 $ 时，$ w(t, x) = 0 $ 
   > 为什么？

类比 MIS，CMIS 也可以定义 Balance Heuristic 如下：

$$
\bar w(t, x) = \frac{p(t)p(x|t)}{\int_\mathcal{T} p(t') p(x|t') dt'} = \frac{p(t, x)}{\int_\mathcal{T} p(t', x)dt} = \frac{p(t, x)}{p(x)}
$$

> 那么其实可以看到，用 Balance Heristic 的 $ w(t, x) $ 带入到 $ \langle I \rangle_{CMIS} $ 之后，其实就会化简成为 $ f(x) / p(x) $，只不过这里的 $ p(x) $ 是 $ p(t, x) $ 的边缘分布。

## 随机多重重要性采样 (Stochastic MIS)

前面的方法会面临一个问题，有的时候 $ p(x) = \int_\mathcal{T} p(t', x)dt $ 是没有闭式解的，这样去算 $ \bar w(t, x) $ 的时候会遇到问题。所以，West 等人又提出了随机多重重要性采样 (Stochastic MIS, SMIS)。

SMIS 首先假设在 $ \mathcal{T} \times \mathcal{X} $ 中独立的采样 $ (t_1, x_1), ..., (t_n, x_n) $ 共 $n$ 组点。

> TODO: implement me

### 应用

#### Path Reuse

#### Spectral Rendering

#### Volume Single Scattering

