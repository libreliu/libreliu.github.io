---
layout: 'paper-reading'
title: '论文阅读 | Automatic Mesh and Shader Level of Detail'
date: 2023-02-21
papertitle: 'Automatic Mesh and Shader Level of Detail'
paperauthors: Yuzhi Liang, Qi Song, Rui Wang, Yuchi Huo, Hujun Bao
papersource: 'IEEE TVCG 2022'
paperurl: 'https://ieeexplore.ieee.org/document/9815871'
status: Working
---

本篇文章给出了在自适应划分的距离组下同时优化网格和 Shader 的 LOD 的优化算法。

文章中首先提出了被称为“交替优化”的优化算法，其中首先对 Shader 利用遗传算法进行变异，得到若干变体，再利用网格简化算法来以 image loss 进行网格简化，使得在给定距离上每个变体对应的运算代价小于给定开销，且误差上满足要求。之后，这些变体会进行排序，前 N% 的变体进入下一轮交替优化，反复多轮后得到结果。

针对交替优化耗时较长的问题，文章中还提出了“分别优化”的算法。该算法会首先分别对网格和 Shader 独立的进行简化，得到一系列质量单调下降的 Shader 和网格变体列，然后再针对每个距离组选择合适的网格和 Shader 对。为了让 LOD 组间的变化尽可能平滑，文章还设置了最平滑的 LOD 切换路线的查找，以及 LOD 组数量的优化操作。

## 相关工作

- 网格简化和 LOD 生成
- Shader 简化和 LOD 生成
- 基于外观的联合优化

## 方法总览

### Formulation

对于 Shader 和网格简化问题，定义三元组 $ (M_i, S_i, d_i) $，其中
- $ M_i $ 为原网格 $ M $ 的第 $ i $ 个简化变体
- $ S_i $ 为原 Shader $ S $ 的第 $ i $ 个简化变体 
- $ d_i $ 为距相机的距离

定义 $ \epsilon_a(i) $ 为简化 $ (M_i, S_i, d_i) $ 变体的绝对图像误差，其定义为

$$
\epsilon_a (i) = \int_H \| f(M_i, S_i, d_i) - \bar{f}(M, S, d_i) \| dH
$$

这里的作为误差模型的积分域 $ H = V \times U \times X \times Y $ ，其中
- $ V $ 为离散的若干个 view direction
- $ U $ 若干 Shader uniform 参数，如光照方向
- $ X \times Y $ 为图像空间的两个维度

这里的范数是 pixelwise RGB $ L^2 $ 范数。

另外，定义 $ \epsilon_t(i) $ 为两个简化组之间的视觉差异：

$$
\epsilon_t (i) = \int_H \| f(M_i, S_i, d_{i+1}) - f(M_{i+1}, S_{i+1}, d_{i+1}) \| dH
$$

这样，LOD 优化问题就可以看作下面的数学问题：

$$
\mathop{\arg \min}_{M_i, S_i, d_i} t = Cost ( f(M_i, S_i, d_i) ) \\
\mathrm{s.t.}\quad \epsilon_a(i) < e_a (d_i) \cdot s_{d_i}
$$

其中 Cost 为在该网格上应用此 Shader 进行着色的时间开销，$ e_a (d_i) $ 为在 $ d_i $ 距离的 absolute per-pixel error bound， $ s_{d_i} $ 为距离 $ d_i $ 时网格 $ M_i $ 的投影大小，

其中 $ e_a(d) $ 采用前面工作提出的一个启发函数：
$$
e_a(d) = (\frac{d-d_{near}}{d_{far} - d_{near}})^Q \cdot e_{max}
$$

其中
- $ d_{near} $ 和 $ d_{far} $ 是设置的视景体参数
- $ e_{max} $ 是 maximum absolute per pixel error bound
  - 也就是关于 $ e_t(i) $ 的积分项关于积分域里面各个部分的最大值
- $ Q \in [0, 1] $ 反映了对误差的容忍程度

### 交替优化

#### Shader 简化

> 这里的 Shader 简化工作主要参考了前面的文章：
> - [3] Y. He, T. Foley, N. Tatarchuk, and K. Fatahalian, “A system for rapid, automatic shader level-of-detail,” ACM Trans. on Graph. (TOG), vol. 34, no. 6, p. 187, 2015.
> - [8] R. Wang, X. Yang, Y. Yuan, W. Chen, K. Bala, and H. Bao, “Automatic shader simplification using surface signal approximation,” ACM Trans. on Graph. (TOG), vol. 33, no. 6, p. 226, 2014.
> - [18] F. Pellacini, “User-configurable automatic shader simplification,”
ACM Trans. Graph., vol. 24, no. 3, pp. 445–452, 2005
> - [21] P. Sitthi-Amorn, N. Modly, W. Weimer, and J. Lawrence, “Genetic programming for shader simplification,” in ACM Transactions on Graphics (TOG), vol. 30, no. 6. ACM, 2011, p. 152.

1. 将 Vertex Shader 和 Fragment Shader 转换为抽象语法树 (AST) 和程序依赖图 (PDG)
2. 应用不同的化简规则来生成简化 Shader
   - Operation Removal: 将 $ op(a, b) $ 省略为 $ a $ 或 $ b $
   - Code Transformation: 将 per-pixel 的 pixel shader 操作移动到 per-vertex 或 per-tessellated-vertex 的操作来减少计算量
   - Moving to parameter: 将参数用其均值替换（$ n \to average(n) $），并且替换到 CPU 的某个 parameter stage 中进行计算，并将均值作为结果送入 GPU Shader 中

> TODO: check 前面的工作

#### Mesh 简化

> Mesh 简化工作：
> - [4] M. Garland and P. S. Heckbert, “Surface simplification using
quadric error metrics,” in Proceedings of the 24th annual conference on
Computer graphics and interactive techniques. ACM Press/AddisonWesley Publishing Co., 1997, pp. 209–216.

主要用了 [4] 那篇简化工作

To simplify a mesh, we adapt the established mesh simplification framework [4] by replacing the original geometric metric with an image error metric, which is computed using the supersampled/filtered images of the original shader as the reference. In particular, we iteratively apply edge collapse operations on edges. However, the placement policy that contracts one edge into a single vertex consumes many computations, so we choose a simpler place-to-endpoints policy that places the vertex to the endpoint with lower image error on the edge. To preserve the topology of the simplified mesh, edges with screen-space lengths larger than D (D = 1 in our implementation) screen pixels would not collapse [31] during our mesh simplification.

#### 交替优化

给定网格 $ M $ 和 Shader $ S $，
1. 搞 Shader 优化 (然后生成一堆变体 $ S_i $)
2. 对于每个在帕累托面上的 $ S_i $，利用该 Shader 进行相应的 Mesh 简化，使得新的 $ M_j $ 在满足质量要求 (也就是 error <= absolute error bound) 的情况下为最简
   > 哪些？
3. 将这些 $ (M_j, S_i) $ 按渲染性能排序，取前 20% 作为种子进入下一轮迭代


### 分别优化

#### 生成网格变体

因为没有任何关于简化后 Shader 的信息，所以作者此处采用原 Shader 进行着色后 supersampled / filtered 的图片作为 loss 环节进行网格简化。

因为某些边简化之后对视觉表现没有什么影响，所以这里只选取 K (实现中 K = 500) 个有较大 error 变化的简化网格作为候选变体。

#### 生成 Shader 变体

理论上，对于不同的场景配置 (简化网格 & 距离配置)，最优的 Shader 变体是不同的。

但是，因为
1. First, as has been proven in prior work [3], the performance and error of shader variants can be predicted instead of being actually evaluated. In this way, we do not need to actually render every shader variant under all scene configurations.
   > 在 [3] 中，性能的预测是通过一种简单的启发函数，即 `scalar fp ops + 100 * texture ops` 来预测的（不同 Shader stage 有不同权重，parameter 数量有额外惩罚）
   >
   > error 的评价是通过 error cache 和偶尔的重新 evaluate 来实现的
2. Second, we noted that for one shader variant with one simplified mesh, the shading errors at distances could be approximated by filtering the rendered image at the closest distance.
   > 通过在最近距离生成着色结果，再进行 filter 来模拟在远处的结果
4. Finally, we further observed that although these Pareto frontiers may change with scene configurations, the shader variants on Pareto frontiers are similar at similar distances and with similarly simplified meshes. 
   > Pareto 面上的 shader 变体基本上是比较稳定的，随着场景配置的变化不是很多

所以，作者最后只选择**有代表性的距离**和**有代表性的简化网格**来计算最优 Shader 变体，而不是穷举所有场景配置。

作者选择均匀的从 N 组距离组里面选择 4 组，然后每个距离组里面选择 10 个前面的简化网格（即 Pareto 面左右的十个），就得到了 40 个组合。然后用 genetic programming 的优化方法来得到每个 (距离, 网格) 组上的最优简化 Shader。这些优化好的 Shader 变体都放到一个数组里面。

