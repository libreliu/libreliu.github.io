---
title: 从 Maxwell 方程组到 Kajiya 渲染方程
date: 2022-08-07
---

<!-- https://news.ycombinator.com/item?id=25306168 -->
<!-- STATUS:
DRAFT 22/8/7: Found material interesting:

Maxwell's -> Fourier optics (scalar wave phenomena) -> Eikonal equation (rays, but in inhomogeneous media) -> Ray optics (rays, but in almost-everywhere homogeneous media).

I think most modern optics textbooks (see, e.g., Fundamentals of Photonics) cover the reductions and the corresponding steps.
-->

本文致力于从 Maxwell 方程组出发，推导出 Kajiya 渲染方程。

本文假设读者学过**多变量微积分** + **数理方程** (一些解 PDE 的技术)。

> 本文作者推荐 **费曼物理学讲义, 第二卷** 作为入门电磁学 / 电动力学的教材。
>
> 数理方程方面可以参考科学出版社出版的 **数学物理方程** (季孝达, 薛兴恒, 陆英 编)。

## 记号

本文用到的记号一览：
- $ \mathbf{E} $: 电场强度，$ \mathbb{R}^3 $
- $ \mathbf{B} $: 磁感应强度，$ \mathbb{R}^3 $
- $ \rho $: (总)电荷密度，$ \mathbb{R} $
- $ \mathbf{j} $: (总)电流密度，$ \mathbb{R}^3 $

## Maxwell 方程组

$$
\nabla \cdot \mathbf{E} = \frac {\rho} {\varepsilon_0} \tag{1}
$$

$$
\nabla \cdot \mathbf{B} = 0 \tag{2}
$$

$$
\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}} {\partial t} \tag{3}
$$

$$
\nabla \times \mathbf{B} = \frac{1}{c^2}\left(\frac{\mathbf{j}}{\varepsilon_0} + \frac{\partial \mathbf{E}} {\partial t} \right) 
\tag{4}
$$

> 真空磁导率 $ \mu_0 $ 满足 $ c^2 \epsilon_0 \mu_0 = 1 $，所以第四项也可以写作
> 
> $$
> \nabla \times \mathbf{B} = \mu_0 \left(\mathbf{j} + {\varepsilon_0}\frac{\partial \mathbf{E}} {\partial t} \right)
> $$
>
> 这些只差常数的问题下面就不再提了。

### 连续性方程

对 (4) 求散度，然后对两边求散度，利用恒等式 $ \nabla \cdot (\nabla \times \vec A)  = 0$ 可以得到连续性方程
$$
\nabla \cdot \left(\mu_0 \left(\mathbf{j} + {\varepsilon_0}\frac{\partial \mathbf{E}} {\partial t} \right)\right) = 0 \Rightarrow \nabla \cdot \mathbf{j} = -\varepsilon_0  \frac{\partial (\nabla \cdot\mathbf{E})} {\partial t} = -\frac{\partial\rho(t)} {\partial t}
$$

### Maxwell 方程组的波动方程形式

首先做些数学工作，将 Maxwell 方程写为比较简单的形式。

> **(Helmholtz 定理)**：假定 $ F $ 为定义在有界区域 $ V \subseteq R^3 $ 里的二次连续可微向量场，且 $ S $ 为 $ V $ 的包围面，则 $ F $ 可被分解成无旋度及无散度两部份
> $$
> \mathbf{F} = -\nabla \Phi + \nabla \times \mathbf{A}
> $$
>
> 这里的无旋和无散部分是可以具体构造出来的，参考[亥姆霍兹分解 - 维基百科](https://zh.wikipedia.org/zh-hans/%E4%BA%A5%E5%A7%86%E9%9C%8D%E5%85%B9%E5%88%86%E8%A7%A3)。

因为 $ \mathbf{B} $ 本身无散度，所以将其用磁矢势 $ \mathbf{A} $ 表示，即定义

$$
\mathbf{B} = \nabla \times \mathbf{A} \tag{5}
$$

这样的 $ \mathbf{A} $ 根据 Helmholtz 定理是自然存在的，且满足 (2) 的要求。

如果 $ \mathbf{E} $ 没有旋度，则将 $ \mathbf{E} $ 表示成一个标量势 $ \phi $ 的函数是自然的。不过很遗憾根据 (3) 这件事不成立。

不过我们可以变通一下，上面的方程 (3) 可以处理成

$$
\nabla \times \mathbf{E} = -\frac{\partial} {\partial t}(\nabla \times \mathbf{A}) = - \left(\nabla \times \frac{\partial \mathbf{A}}{\partial t} \right)
$$

那么，根据叉乘的结合律分配律有
$$
\nabla \times \left( \mathbf{E} + \frac{\partial \mathbf{A}}{\partial t} \right) = 0 
$$

根据这个组合量旋度为 0 的性质，再次利用 Helmholtz 定理，我们可以保证找到标量场 $ \phi $ ，使得其为一个标量势：

$$
\mathbf{E} + \frac{\partial \mathbf{A}}{\partial t} = -\nabla \phi \tag{6}
$$

> 在静电学情况下，(6) 会退化到 $ \mathbf{E} = -\nabla \phi $

在 (6) 对 $ \phi $ 的要求下，$ \mathbf{E} $ 现在可以被 $ \phi $ 和 $ \mathbf{A} $ 表示：

$$
\mathbf{E} = -\nabla \phi -  \frac{\partial \mathbf{A}}{\partial t} \tag{7}
$$

现在只剩下 (1) 和 (4) 的转化。

将 (7) 带入 (1) 得到

$$
\nabla \cdot \left( -\nabla \phi -\frac{\partial \mathbf{A}}{\partial t} \right) = \frac {\rho} {\varepsilon_0}
$$

整理得到

$$
-\nabla^2 \phi - \frac{\partial }{\partial t} \left(\nabla \cdot \mathbf{A}\right) = \frac{\rho}{\varepsilon_0} \tag{8}
$$

这是一个 $ \phi $ 和 $ \mathbf{A} $ 与电荷源 $\rho$ 联系的方程。

将 (5) 和 (7) 带入 (4)：

$$
\nabla \times \left(\nabla \times \mathbf{A} \right) - \frac{1}{c^2} \frac{\partial} {\partial t} \left( -\nabla \phi -  \frac{\partial \mathbf{A}}{\partial t} \right) = \frac{\mathbf{j}}{\varepsilon_0 c^2} 
$$

利用矢量恒等式 (证明可以参考我的[另一篇博客](TODO))
$$
\nabla \times (\nabla \times A) = \nabla (\nabla \cdot \mathbf{A}) - \nabla^2 \mathbf{A}
$$

得到
$$
-\nabla^2 \mathbf{A} +\nabla (\nabla \cdot \mathbf{A})  + \frac{1}{c^2} \frac{\partial} {\partial t} \nabla \phi + \frac{1}{c^2} \frac{\partial^2 \mathbf{A}} {\partial t^2}  = \frac{\mathbf{j}}{\varepsilon_0 c^2} \tag{9}
$$

<!-- 这里说的不是很严谨 -->
考虑到我们如果能找到 $ \psi $ 使得同时变换 $ \mathbf{A} $ 和 $ \phi $ 满足下面的约束的话，(5) 和 (7) 是仍然满足的（自然衍生产品 (8) 也满足）
$$
\mathbf{A}' = \mathbf{A} + \nabla \psi \qquad \phi' = \phi - \frac{\partial \psi}{\partial t} 
$$

> 证明很简单，带入到 (5) 和 (7) 验证即可

那么，我们可以确定这样的 $ \psi $

<!-- TODO: left for exercise, per feynman book (chinese translation) page 241 -->

进而可以将 $ \mathbf{A} $ 的散度确定在一个固定的值
$$
\nabla \cdot \mathbf{A} = - \frac{1}{c^2} \frac{\partial \phi}{\partial t} \tag{10}
$$

> 选择 $ \nabla \cdot \mathbf{A} $ 的值被称为 “选取一个规范”，上面的规范选择为[洛伦茨规范](https://zh.wikipedia.org/wiki/%E6%B4%9B%E4%BC%A6%E8%8C%A8%E8%A7%84%E8%8C%83)。

这样做可以将 (9) 的中间两项消去，得到
$$
-\nabla^2 \mathbf{A} + \frac{1}{c^2} \frac{\partial^2 \mathbf{A}} {\partial t^2}  = \frac{\mathbf{j}}{\varepsilon_0 c^2}
$$

整理一下
$$
\nabla^2 \mathbf{A} - \frac{1}{c^2} \frac{\partial^2 \mathbf{A}} {\partial t^2}  = -\frac{\mathbf{j}}{\varepsilon_0 c^2} \tag{11}
$$

> 这是一个矢量方程，相当于三个分量各自满足该空间维度上的 (三维) 波动方程。

别忘了 (8) 中间也有一项可以用规范变换 (9) 定义的散度去掉
$$
-\nabla^2 \phi + \frac{1}{c^2} \frac{\partial^2 \phi}{\partial t^2} = \frac{\rho}{\varepsilon_0}
$$

整理一下
$$
\nabla^2 \phi - \frac{1}{c^2} \frac{\partial^2 \phi}{\partial t^2} = -\frac{\rho}{\varepsilon_0} \tag{12}
$$

那么，现在问题变成了，给定 $ \mathbf{j}(\mathbf{x}, t) $ 和 $ \rho(\mathbf{x}, t) $，只要能解决 (11) 和 (12) 两个波动方程，就可以知道 $ \phi(\mathbf{x}, t) $ 和 $ \mathbf{A}(\mathbf{x}, t) $，问题就解决了。

### 向波动方程进发

形如 $ u_{tt} = a^2 \nabla^2 u $ 的方程被称为波动方程。

波动方程在可以用基本解方法来进行求解。

考虑

$$
\left\{
\begin{aligned}
&\frac{\partial^2 u}{\partial t^2} = Lu + f(t, M) \\
&u |_{t=0} = \phi(M), \left.\frac{\partial u}{\partial t} \right|_{t=0} = \psi(M)
\end{aligned}
\right.
$$

> 公式中的 $M$ 为空间坐标，$L$ 为一个线性微分算子

如果带入 $ L = a^2 \nabla^2 $，即为波动方程。

假设我们可以解出基本解 $ U $

> Q: 什么是基本解？
>
> A: 比如说 $ Lu = f(M) $ 不会算，但是我想办法用 $ LU = \delta(M) $ 的解去凑；比如，点电荷的场 $ \Delta u = f(M) $ 不会，那就考虑离散的激励 (a.k.a. 点电荷) $ \delta(M) $ 产生的场，然后用叠加原理 + 势函数平移等等技术来做；这里面的 $ U $ 就是基本解

$$
\left\{
\begin{aligned}
&\frac{\partial^2 U}{\partial t^2} = LU \\
&U |_{t=0} = 0, \left.\frac{\partial U}{\partial t} \right|_{t=0} = \delta(M)
\end{aligned}
\right.
$$

则利用基本解，我们可以首先构造三个问题
$$
\left\{
\begin{aligned}
&\frac{\partial^2 u_1}{\partial t^2} = Lu_1 \\
&u_1 |_{t=0} = 0, \left.\frac{\partial u_1}{\partial t} \right|_{t=0} = \phi(M)
\end{aligned}
\right.
\\
\left\{
\begin{aligned}
&\frac{\partial^2 u_2}{\partial t^2} = Lu_2 \\
&u_2 |_{t=0} = \psi(M), \left.\frac{\partial u_2}{\partial t} \right|_{t=0} = 0
\end{aligned}
\right.
\\
\left\{
\begin{aligned}
&\frac{\partial^2 u_3}{\partial t^2} = Lu_3 + f(t, M) \\
&u_3 |_{t=0} = 0, \left.\frac{\partial u_3}{\partial t} \right|_{t=0} = 0
\end{aligned}
\right.
$$
前两个容易验证，同时可以用齐次化原理 (a.k.a.  冲量原理) 得到 $u_3$
$$
u(t, M) = u_1 + u_2 + u_3 = U(t, M) \ast \psi(M) + \frac{\partial}{\partial t}[U(t,M) \ast \phi(M)] + \int_0^t {U(t-\tau, M) \ast f(\tau, M) d\tau}
$$

<!-- TODO: write step by step -->

其中的卷积是关于 $ M $ 的，以 $ M = (x, y, z) $ 为例：

$$
U(t, M) \ast \psi(M) = \iiint_{\Omega} U(t, x-\tau_1, y-\tau_2, z-\tau_3) \phi(\tau_1, \tau_2, \tau_3) d \tau_1 \tau_2 \tau_3
$$

#### 基本解的求解

那么下面就要求解波动方程的基本解 $ U $ 了。

我们先把问题抄一遍：

$$
\left\{
\begin{aligned}
&\frac{\partial^2 U}{\partial t^2} = a^2 \nabla^2 U \\
&U |_{t=0} = 0, \left.\frac{\partial U}{\partial t} \right|_{t=0} = \delta(x,y,z)
\end{aligned}
\right.
$$

<!-- TODO: recap on fourier transform method -->

用 Fourier 变换法，解得

$$
U(t, x, y, z) = \frac{\delta(r-at)}{4 \pi a r}
$$

其中

$$
r = \sqrt{x^2+y^2+z^2}
$$

#### 三维波动方程的初值问题

我们将前面的波动方程的解带入

<!-- todo: step by step -->

<!-- https://math.meta.stackexchange.com/questions/9973/how-do-you-render-a-closed-surface-double-integral -->
$$
\begin{aligned}
u_1(t,x,y,z) &= \frac{1}{4 \pi a} \iiint_{-\infty}^{+\infty} \frac{\delta(r-at)}{r} \psi(\xi, \eta, \zeta) d \xi d \eta d \zeta \\
&= t \frac{1}{4 \pi (at)^2} \oint_{S_{at}} \psi(\xi, \eta, \zeta) dS \\
&= t M_{at} (\psi) \\
u_2(t,x,y,z) &= \frac{\partial}{\partial t} [t M_{at} (\psi)]\\
u_3(t,x,y,z) &= \frac{1}{4 \pi a^2} \int_{0}^{at} \oint_{S_r} \frac{1}{r} f(t- \frac{r}{a}, \xi, \eta, \zeta) dSdr \\
\end{aligned} 
$$

> 其中
> - $ r = \sqrt{(x-\xi)^2 + (y-\eta)^2 + (z-\zeta)^2}) $
> - $ M_{at} $ 表示函数 $ \psi $ 在 (x,y,z) 为中心，at 为半径的球面 $ S_{at} $ 上的平均值

#### 带入原问题

我们从 (11) 和 (12) 开始继续向前：

$$
\nabla^2 \mathbf{A} - \frac{1}{c^2} \frac{\partial^2 \mathbf{A}} {\partial t^2}  = -\frac{\mathbf{j}}{\varepsilon_0 c^2} \tag{11}
$$

$$
\nabla^2 \phi - \frac{1}{c^2} \frac{\partial^2 \phi}{\partial t^2} = -\frac{\rho}{\varepsilon_0} \tag{12}
$$

首先将其整理为

## 单色波解

如果只考虑单色波 (i.e. 以单一频率振荡的波) 的话，Maxwell 方程组可以化简到相当简单的形式：因为对时间求导的项变得很容易处理，剩下的主要是类似泊松方程一样，只和空间导数相关的微分方程。

设
$$
\mathbf{E}(t, {\bf r}) = \mathbf{E_0}({\bf r}) \cos(\omega t + \alpha({\bf r})) \\
\mathbf{B}(t, {\bf r}) = \mathbf{B_0}({\bf r}) \cos(\omega t + \beta({\bf r}))
$$

如果按下面的方法定义复数量 $ \mathcal{E} $ 和 $ \mathcal{B} $ 的话

> 相当于 $ \mathcal{E} $ 和 $ \mathcal{B} $ 给出了幅度和初相位信息。

$$
\mathcal{E}({\bf r}) = \mathbf{E_0}({\bf r}) e^{j \alpha({\bf r})} \\
\mathcal{B}({\bf r}) = \mathbf{B_0}({\bf r}) e^{j \beta({\bf r})} \\
\mathbf{E}(t, {\bf r}) = \mathbf{E_0}({\bf r}) \cos(\omega t + \alpha({\bf r})) = \operatorname{Re}[\mathcal{E}({\bf r}) e^{j\omega t}]\\
\mathbf{B}(t, {\bf r}) = \mathbf{B_0}({\bf r}) \cos(\omega t + \beta({\bf r})) = \operatorname{Re}[\mathcal{B}({\bf r}) e^{j\omega t}]
$$
这样的 $\mathcal{E}$ 和 $\mathcal{B} $ 又被称为相量 （phasor）。

故而，原来的 Maxwell 方程可以进行带入操作，如 E 的旋度和 B、M 的关系可以重写成下面的形式
$$
\begin{aligned}
\nabla \times e^{j\omega t} \mathcal{E} &= \nabla \times \left( \mathbf{E}_0(r)e^{j\alpha(r) + j\omega t} \right) \\
&= -\frac{\partial}{\partial t} \left( \mathbf{B}_0(r)e^{j\alpha(r) + j\omega t} \right) + e^{j\omega t}\mathcal{M} \\
&= -(j\omega) \mathbf{B}_0(r) e^{j \alpha(r) + j \omega t} + e^{j\omega t}\mathcal{M} \\
&=  -j\omega e^{j\omega} \mathcal{B} + e^{j\omega t}\mathcal{M}\\

\Rightarrow \nabla \times \mathcal{E} &= -j \omega \mathcal{B} + \mathcal{M}
\end{aligned}
$$

类似的，可以得到
$$
\begin{aligned}
\nabla \times \mathcal{E} &= -j \omega \mathcal{B} + \mathcal{M} \\
\nabla \times \mathcal{H} &= j \omega \mathcal{D} + \mathcal{J}  \\
\nabla \cdot \mathcal{D} &= \sigma_e  \\
\nabla \cdot \mathcal{B} &= \sigma_m  \\
\end{aligned}
$$
在均匀媒质下有
$$
\begin{aligned}
\nabla \times \mathcal{E} &= -j \omega \mu \mathcal{H} + \mathcal{M} \\
\nabla \times \mathcal{H} &= j \omega \epsilon \mathcal{E} + \mathcal{J}  \\
\nabla \cdot (\epsilon \mathcal{E}) &= \sigma_e  \\
\nabla \cdot (\mu \mathcal{H}) &= \sigma_m  \\
\end{aligned}
$$
先分离成 $ \mathcal{E}_e $ 和 $ \mathcal{E}_m $ ，然后 P59 说的很清楚



### Eikonal 方程

<!--
https://wiki.seg.org/wiki/Diffraction_and_ray_theory_for_wave_propagation 
https://www.cambridge.org/core/books/ray-tracing-and-beyond/706CC068AEF2FA5C84C48278FC449761
https://www.cambridge.org/core/books/abs/ray-tracing-and-beyond/eikonal-approximation/B09582EE0BAEA706A59238649960C761
-->

<!-- Principles of Optics, chapter 8
https://physics.stackexchange.com/a/91651
-->



### Kirchhoff 积分

## Recap: 我们到底干了什么？

