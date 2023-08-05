---
title: 微积分和数理方程备忘
date: 2023-07-22
---

> 本文持续更新。
> 
> Changelog:
> - 2023-07-22: 增加了变上限积分求导的相关备忘。

## 变上限积分求导

### 不含参

设 $ \Phi(x) = \int_a^x f(t) dt$ ，则

$$
\begin{aligned}
\Phi'(x) = \frac{d}{dx} \int_a^{x} f(t) dt = f(x)
\end{aligned}
$$

用复合函数求导的办法，可以求出诸如 $ \int_{\phi(x)}^{\psi(x)} f(t) dt $ 的导数。

### 含参

$ \Phi(x) = \int_{a(x)}^{b(x)} f(t, x) dt $ ，则设 $ F(x,  a, b) = \int_{a}^{b} f(t, x) dt$ ，则

$$
\begin{aligned}
\Phi'(x) &= \frac{dF}{dx} + \frac{dF}{db}\frac{db}{dx} + \frac{dF}{da} \frac{da}{dx} \\
&= \int_{a(x)}^{b(x)} \frac{df(t, x)}{dx} dt + f(b(x), x) b'(x) - f(a(x), x) a'(x)
\end{aligned}
$$

## Fourier 级数、变换、复数形式

Fourier 级数的目标是使用 $ \{ 1, \cos x, \sin x, \cos 2x, \sin 2x, ... \} $ 的正交三角函数系来表示周期为 $ l $ 的周期函数。

