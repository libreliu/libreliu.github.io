---
layout: 'paper-reading'
title: '论文阅读 | Neural Pyramid Denoising'
date: 2023-06-10
papertitle: 'Neural Partitioning Pyramids for Denoising Monte Carlo Renderings'
paperauthors: Martin Balint, Krzysztof Wolski, Karol Myszkowski, Hans-Peter Seidel
papersource: 'SIGGRAPH 2023'
paperurl: 'https://balint.io/nppd/'
status: Placeholder
---

## 回顾

> 更多相关内容请参考 KPCN 文章 ([Kernel-Predicting Convolutional Networks for Denoising Monte Carlo Renderings, 2017](https://dl.acm.org/doi/pdf/10.1145/3072959.3073708)) 的相关内容

$$
x_p = \{c_p, f_p\}
$$

MC 降噪的目标是生成一个估计值 $ \hat{c}_p $，其和真实值 $ \bar{c}_p $ 尽可能接近。

这种估计是逐邻域的，在一个块 $ X_p $ 上进行操作。

