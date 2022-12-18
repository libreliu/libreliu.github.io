---
layout: 'paper-reading'
title: '论文阅读 | 数据驱动的 PRT'
date: 2022-12-13
papertitle: 'A Data-Driven Paradigm for Precomputed Radiance Transfer'
paperauthors: Laurent Belcour, Thomas Deliot, Wilhem Barbier, Cyril Soler
papersource: 'CGIT 2022'
paperurl: 'https://dl.acm.org/doi/10.1145/3543864'
status: Working
---

> 本文省略了一大堆细节，详情参见论文。
>
> TODO: 整理清楚各个维数，因为原论文也不甚详细；
>
> 更新后的版本会放到 [这里](https://blog.libreliu.info/paper-reading/data-driven-prt/)，如果有。

## Recap: Precomputed Radiance Transfer

> 本节主要参考[GAMES 202 - 高质量实时渲染](https://www.bilibili.com/video/BV1YK4y1T7yY)课程的 Lecture 6 和 Lecture 7

考虑渲染方程

$$
L({\bf o}) = \int_{\mathcal{H}^2} L({\bf i}) \rho({\bf i}, {\bf o}) V({\bf i}) \max(0, {\bf n} \cdot {\bf i}) d {\bf i}
$$

其中
- $ {\bf i}, {\bf o} $ 为入射和出射方向
- $ L({\bf i}), L({\bf o}) $ 为入射和出射 radiance
  - 此处**省略了**作为参数的 shading point 位置 $ \bf x $，下同
- $ \rho $ 为 BRDF 函数
- $ V $ 为 Visibility 项

将 $ L({\bf i}) $ 项用级数的有限项进行近似，即

$$
L({\bf i}) \approx \sum_{i=1}^{n} l_i B_i({\bf i})
$$

> 其中 $ B_i: S^2 \to \mathbb{R} $ 为基函数

带入得到

$$
\begin{aligned}
L({\bf o}) &= \int_{\mathcal{H}^2} L({\bf i}) \rho({\bf i}, {\bf o}) V({\bf i}) \max(0, {\bf n} \cdot {\bf i}) d {\bf i} \\
&\approx \sum_i l_i \int_{\mathcal{H}^2} B_i({\bf i}) \rho({\bf i}, {\bf o}) V({\bf i}) \max(0, {\bf n} \cdot {\bf i}) d {\bf i} \\
&= \sum_i l_i T_i({\bf o})
\end{aligned}
$$

这里把上面的积分 ("Light transport term") 记作 $ T_i $.

这里继续进行展开

$$
T_i({\bf o}) \approx \sum_{j=1}^{m} t_{ij} B_j({\bf o})
$$

所以我们得到

$$
\begin{aligned}
L({\bf o}) &\approx \sum_i l_i T_i({\bf o}) \\
&\approx \sum_i l_i \left( \sum_j t_{ij} B_j({\bf o}) \right) \\
&\approx \sum_j \left( \sum_i l_i t_{ij} \right) B_j({\bf o}) \\
\end{aligned}
$$

也就是说
$$
L({\bf o}) 
\approx 
\begin{bmatrix}
l_1 & ... & l_n
\end{bmatrix}
\begin{bmatrix}
t_{11} & ... & t_{1m} \\
\vdots & & \vdots \\
t_{n1} & ... & t_{nm}
\end{bmatrix}
\begin{bmatrix}
B_1({\bf o}) \\ \vdots \\ B_m({\bf o})
\end{bmatrix}
$$

那么，PRT 的框架就大致如下
1. 预计算
   - 对每个可能的 shading point $ {\bf x} $
     - 计算该物体的环境光在基函数下对应的系数 $ l_i $
     - 计算该物体光传输展开系数 $ t_{ij} $
   
   > 当然，对于 Image based lighting，一般认为 $ L({\bf i}, {\bf x}) \approx L({\bf i}) $，那某些东西就不需要 per-shading point 存储
2. 运行时
   
   - 根据视角 $ {\bf o} $ 和位置 $ {\bf x} $ 来读取对应的向量并计算

> 对于 Diffuse 物体，$ \rho({\bf i}, {\bf o}) $ 是常数，所以不需要继续展开 $ T_i $ 项

> Remarks from paper: PRT methods bake the transport matrix using implicit light sources defined by the illumination basis.
Those light sources shade the asset with positive and negative radiance values. Hence, a dedicated light transport algorithm is used for them.

## 本文思路

本文的框架只考虑**漫反射**，虽然结果上对于不是特别 Glossy 的材质应该都可以应用。

框架上的思路就是
- 间接光 $ L_i({\bf x}; t) $ 和直接光 $ L_d({\bf i}, {\bf x}; t) $ 之间存在线性关系
- 框架：
  - 将 $ {\bf x} $ 和 $ i \times t $ 所在空间分别做一离散化，得到 $ I = MD $
    - 相当于挑了一组基，每个基内部由同一个光照条件下各个位置的 $ L_d $ 组成
  - 对于给定的光照条件 $ x $ （各个位置 $ L_d $的值构成的列向量） ，如何求解 $ L_i $ ？
    - 首先把 $ x $ 分解到该 $ D $ 基下，得到系数向量 $ c = (D^T D)^{-1} D^T x $
    - 每个 $ D $ 基我们都存储有对应的输出，所以结果 $ y = Mx = I(D^T D)^{-1} D^T x $
- 近似：
  - 对 $ I $ 进行 SVD 分解并保留前 $ k $ 项，得到近似矩阵 $ I = U \Sigma V^T \approx U_n \Sigma_n V_n^T $
  - $ y \approx U_n (\Sigma_n V_n^T) (D^T D)^{-1} D^T x $
    - let $ M_n = (\Sigma_n V_n^T) (D^T D)^{-1} D^T $
  - 存储 $ U_n $ 和 $ M_n $
- 运行时：
  - 用 G-Buffer 得到 $ \mathcal{X}_D $ 空间上的各 $ L_d({\bf i}, {\bf x}; t) $ 的值
  - 计算 $ y = U_n M_n x $ 的值

### 估计光传输矩阵

给定**环境光**条件 $ t \in \mathcal T $，那么在物体表面 $ {\bf x} $ 处，**漫反射**光传输方程的形式如下
$$
L_i({\bf x}; t) = \frac{1}{2 \pi}\int_{\mathcal{H}^2} L_d({\bf i}, {\bf x}; t) V({\bf i}, {\bf x}) \max(0, {\bf n} \cdot {\bf i}) d {\bf i}
$$

其中，$ L_i({\bf x}; t) $ 被称为间接光， $ L_d({\bf i}, {\bf x}; t) $ 被称为直接光

> $ L_d({\bf i}, {\bf x}; t) $ 不考虑环境和物体 inter-reflection; 推导中可以先忽略，虽然实际上对于有 inter-transmission 的情况应该也是可以应用的

现在将 $ {\bf x} $ 和 $ i \times t $ 所在空间分别做一离散化，得到 $ \mathcal{X}_D $ 和 $ \mathcal{T}_D $ 两有限维空间，那么在这两个空间上， $ L_d $ 和 $ L_i $ 都可以表示为矩阵形式，这里规定每一列的元素在同一个环境光条件 $ {\bf i}, t $ 上。

> 比如说，都在环境光为某点光源照射的情况； $ L_d({\bf i}, {\bf x}; t) $ 的 $ {\bf i} $ 一般意义上是依赖 $ t $ 的

记得到的两个矩阵为 $ D $ 和 $ I $，则

$$
I_k = f(D_k) \quad \forall k \in [0, |\mathcal{T}_D|]
$$

从前面可以看到，这里的 $f$ 是线性算子 (*是嘛？*)，所以

$$
I = MD
$$

又假设我们离散 $ \mathcal T $ 空间离散的很好，那么对任意的环境光条件，**直接光向量** $ x $ 都可以表示成 $ D $ 的线性组合，满足

$$
x = Dc
$$

左右乘 $ M $ 得到

$$
Mx = MDc = Ic
$$

也就是说 $x$ 产生的间接光照可以用 $I$ 中列向量的线性组合来表示

因为 $ x = Dc $，假设 $ D^T D $ 可逆，那么用左逆得到

$$
c = (D^T D)^{-1} D^T x
$$

那么

$$
y = Mx = Ic = I (D^T D)^{-1} D^T x
$$

这样就给出了**任意直接光经过光传输**的结果

### 间接光基函数

我们认为，间接光所对应的空间的秩比较低，所以用 SVD 分解然后保留前 $ n $ 项

$$
I = U \Sigma V^T \approx U_n \Sigma_n V_n^T = U_n C_n
$$

其中记 $ C_n = \Sigma_n V_n^T $

带回去，得到任意直接光组合经过光传输方程的近似结果

$$
\begin{aligned}
y &\approx U_n C_n (D^T D)^{-1} D^T x \\
&\approx U_n M_n x
\end{aligned}
$$

其中 $ M_n = C_n (D^T D)^{-1} D^T $

### 直接光编码

如果有需要的话，可以考虑 SH 基函数，详见文章

## 对比经典 PRT

First, because classical PRT restricts the frequency content of the incoming lighting, we can see that the directional light leaks behind the object. Our method **does not restrict the frequency content of incoming light** but rather **the space of possible indirect illumination**.  Hence, we can better reproduce such lighting scenario. 

Furthermore, classical PRT is performed on the vertices of the asset. This can cause interpolation artifacts when the asset is poorly tessellated, and it also links performance to the vertex count. Since we rely on a **meshless approach**, we are free of issues.

## 局限

**Sparse Illumination Measurement**. As shown in Section 3.3, the sampling of the measurement points is linked to the achievable lighting dimensionality. Thus, it needs to be sufficiently dense to reproduce the space of observable lighting configurations. It follows that a lighting scenario mixing many light types might require a denser sampling. 

**No Directionality**. We reconstruct a diffuse appearance when reconstructing indirect illumination. However, since our method does not depend on the encoding of the measured indirect illumination, it can be extended to reconstruct glossy appearances e.g. directional distributions using directional sampling or any basis such as Spherical Harmonics. However, our method is likely to be restricted to low frequency gloss here and will not work to render specular reflections. 

**Large Assets**. Our solution is not designed to handle assets such as levels in a game. Because we handle light transport globally and reduce it with a handful of basis functions, we cannot reconstruct the interconnected interiors or large environments in which the combinatorics of possible illumination is large. For such case, our method would require to be extended to handle modular transfer between disjoint transport solutions (Similar to Loos et al. [2011]).