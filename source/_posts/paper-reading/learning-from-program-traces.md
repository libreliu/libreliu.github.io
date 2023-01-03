---
layout: 'paper-reading'
title: '论文阅读 | Learning from Shader Program Traces'
date: 2023-01-03
papertitle: 'Learning from Shader Program Traces'
paperauthors: Yuting Yang, Connelly Barnes, Adam Finkelstein
papersource: 'Eurographics 2022'
paperurl: 'https://arxiv.org/abs/2102.04533v2'
status: Complete
---

## 简介

- Program trace
  - In software engineering, a trace refers to the record of all states that a program visits during its execution, including all instructions and data.
  - 本文提到的 Shader program trace，只包括中间结果 (**data**)，而不包括程序序列 (**instruction**)。

Since the fragment shader program operates independently per pixel, we can consider the full program trace as a vector of values computed at each pixel – a generalization from simple RGB.

## 方法

- 输入是用（嵌入到 Python 的） DSL 写的 fragment procedural shader program，翻译成 Tensorflow 程序
  - 可以同时输出渲染好的图片和生成的 program trace
  - 分支展开、循环 unroll
  - These policies permit us to express the trace of any shader as a fixed-length vector of the computed scalar values, regardless of the pixel location

### 输入特征化简

- 编译器优化
  - 忽略常量值、计算图上重复的节点，因为其在不同 pixel 位置的运行结果应该高度统一
- 不生成内建函数的 trace
- 检测并筛除迭代改进模式的循环中的中间 trace 结果
  - 比如，raymarching 找 closest intersection 的迭代
- 均匀的特征下采样
  - The most straightforward strategy is to subsample the vector by some factor n, retaining only every nth trace feature as ordered in a depth first traversal of the compute graph
- 其它采样方案 (都不太好用)
  - clustering
  - loop subsampling
  - first or last
  - mean and variance

We **first apply compiler optimizations**, then **subsample the features with a subsampling rate that makes the trace length be most similar to a fixed target length**.

For all experiments, we target a length of 200, except where specifically noted such as in the simulation example. 

After compiling and executing the shader, we have **for every pixel: a vector of dimension N**: the number of recorded intermediate values in the trace

### 特征白化

主要是为了解决 shader trace 里面的异常值，防止干扰训练和推理。用的是 Scaling + clamping。

- Check if the distribution merits clamping
  - If N <= 10, no need to clamp
  - Else, do clamp
    - Discard NaN, Inf, -Inf
    - let $P_0$ = Lowest p'th percentile, $P_1$ = highest p'th percentile, superparam $ \gamma $
    - Clamp to $ [P_0 − \gamma(P_1− P_0), P_1 + \gamma(P_1 − P_0)] $
  - Do rescale
    - for each intermediate feature, rescale the clamped values to the fixed range $ [-1,1] $
    - Record the bias and scale used (in rescaling)

The scale and bias is recorded and used in both training and testing, but the values will be clamped to range
[-2, 2] to allow data extrapolation.

> 感觉有点乱...

### 网络

#### 结构

- 1x1 Conv + Feature Reduction (N = 200 -> K = 48) 
- 1x1 Conv * 3
- Dilated Convolution (1, 2, 4, 8, 1)
- 1x1 Conv * 3 
- 1x1 Conv + Feature Reduction (K = 48 -> 3, that is, RGB color output)

#### 损失函数

$ L_b = L_c + \alpha L_p $
- $ L_c $ 是 RGB 图像上的标准 $ L_2 $ loss
- $ L_p $ 是 [The Unreasonable Effectiveness of Deep Features as a Perceptual Metric](https://arxiv.org/abs/1801.03924) 这篇文章中给出的损失函数度量 LPIPS
  - 大概就是，做了一个图像相似数据集，弄了很多 distortions 和 CNN 常见任务输出的图片，做 2AFC 和 JND，随后学习这个 metric
  - [深度特征度量图像相似度的有效性——LPIPS](https://zhuanlan.zhihu.com/p/162070277) 这篇知乎文章比较不错

下面还有个 Appendix D，里面有实验的 GAN 的 loss

#### 训练策略

## 结果展示

和一个 Baseline 方法 RGBx 对比，这个 Baseline 用的手挑特征 normal, depth, diffuse, specular color (*where applicable*) 来作为输入进行学习。

### Denoising fragment shaders

目标是用 1spp 图像来学习 1000spp 的 reference image。

### Reconstructing simplified shaders

这个任务是，从简化后的 Shader 的运行结果中，重建原来 Shader 的运行结果。

简化 Shader 采用的是 Loop perforation 和 Genetic Programming Simplification。

用两个 Conditional GAN，分别称为 Spatial GAN 和 Temporal GAN，一个用来从 1spp 的图 $ c_x $ 生成 Ground Truth (原来的 Shader 运行结果) $ c_y $，另一个用来从前面三帧的 1spp 输出 + 前面两帧的 Spatial GAN 的生成器的输出来生成下一帧，也就是用序列 $ \tilde {c_x} $ 生成序列 $ \tilde {c_y} $。

> GAN related:
> - [四天搞懂生成对抗网络（一）——通俗理解经典GAN](https://zhuanlan.zhihu.com/p/301309418)
> - [四天搞懂生成对抗网络（二）——风格迁移的“精神始祖”Conditional GAN](https://zhuanlan.zhihu.com/p/302720602)

### Postprocessing filters

学习一些后处理效果的 Shader，如 edge-aware sharpening filter 和 defocus blur 效果。

### Learning to approximate simulation

学习一些进行模拟的 Shader 将来的运行结果。

## Trace 有效性分析

这里主要做了两件事：
1. 哪些 Input feature 比较重要？
   - 这里作者采用求 Loss 关于 input trace feature 的一阶导数来评价重要性
2. 挑一个 Subset 来做训练？
   - 给定 m 个 feature 的训练 budget，如果要评价任意的 subset，即从 N 个里面抽 m 个来做训练的话，开销太大
     - Oracle: 按 1 中所述重要性评分的前 m 个 input trace feature
     - Opponent: 按 1 中所述重要性评分的后 m 个 input trace feature
     - Uniform: 随便挑 m 个
   - 发现 Oracle > Opponent > Uniform
3. 多个 Shader 一起学习
   - 多个 Shader 一起学习降噪任务，感觉就像训练一个真·denoiser
