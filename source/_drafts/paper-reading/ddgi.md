---
layout: 'paper-reading'
title: '论文阅读 | Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields'
date: 2022-07-21
papertitle: 'Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields'
paperauthors: Zander Majercik, Jean-Philippe Guertin, Derek Nowrouzezahrai, Morgan McGuire
papersource: 'JCGT 2019'
paperurl: 'https://jcgt.org/published/0008/02/01/'
status: Working
---

## 简介

本篇文章提供了一种高效的计算动态物体和动态光源情形下的全局光照的方法。

First, we compute the dynamic irradiance field using an efficient GPU memory layout, geometric ray tracing, and appropriate sampling rates without down-sampling or filtering prohibitively large spherical textures. Second, we devise a robust filtered irradiance query, using a novel visibility-aware moment-based interpolant.

## 框架

### DDGI light probe

DDGI 是一种利用 light probe（光照探针）进行动态全局光计算的方法。

对于位于 $ \mathrm{x'} $ 位置的 light probe，所有的出射方向可以视为从 probe 所在位置到以 probe 所在位置为中心的单位球面上点构成的向量的集合。此时，构造一个 $ S^2 \to R^2 $ 的映射，使得球面的八个扇区分别映射到八面体的八个面上，这个映射被称为八面体映射 (octahedron mapping)。

> 文章中描述到，八面体映射的好处，在于可以将球面以比较均匀的参数化映射到正方形上去，方便之后将每个方向相对应的量储存到 2D 纹理上面去。

通过八面体映射，就可以将 probe 每个方向的信息存储在正方形的纹理贴图上了。

不过，在这篇文章中，出于性能考虑，作者采用了类似 Variance Shadow Mapping 的方法，极大压缩了纹理贴图的分辨率，同时对于每个 probe 的贴图的每个方向，分别存放

1. $ E_i(\mathrm{x'}, w) $: probe 以 $ \omega $ 方向为天顶的半球的入射 irradiance
2. $ r(\omega) $: probe 在 $ \omega $ 方向对应的最近邻图元的距离在半球面的均值
   - 也就是 $ \int d(x', \omega) d \omega $，其中 $ d(x, \omega): R^3 \times \Omega \to R $ 为在 $ x $ 处沿 $ \omega $ 方向到最近邻图元的距离
3. $ r^2(\omega) $: probe 在 $ \omega $ 方向对应的最近邻图元的距离的平方在半球面的均值

三组信息。

> Recall: radiance 和 irradiance
> - Radiance (輻射率): 单位面积单位立体角辐射功率，$ d\Phi / (dS d\Omega) $
> - Irradiance (辐照度): 单位面积辐射功率 $ d\Phi / dS $

### 利用 probe 进行间接光计算

前面提到 probe 中存储的信息为 probe 所在位置中各个方向的入射 irradiance。如果把场景中各处的 irradiance 看成一个 irradiance 场，那么现在要处理的问题就是给定场在某些位置的值，插值出其他位置的值的过程。

可以想象到，如果场本身的变化相对于 probe 间距离来说变化比较缓慢，那么方法就会工作的比较好。

不过，也有一些会导致变化较快的情况：
1. 图元本身与 probe 所成夹角
2. 图元被某些物体遮挡

所以，DDGI 提出了这样的框架来进行着色：

```glsl
// float3 n = shading normal, X = shading point, P = probe location
float4 irradiance = float4(0);
for (each of 8 probes around X) {
    float3 dir = P – X;
    float r = length(dir);
    dir *= 1.0 / r;

    // smooth backface
    float weight = (dot(dir, n) + 1) * 0.5;

    // adjacency
    weight *= trilinear(P, X);

    // visibility (Chebyshev)
    float2 temp = texelFetch(depthTex, probeCoord).rg;
    float mean = temp.r, mean2 = temp.g;
    if (r > mean) {
        float variance = abs(square(mean) – mean2);
        weight *= variance / (variance + square(r – mean));
    }
    irradiance += sqrt(texelFetch(colorTex, probeCoord) * weight;
}
return square(irradiance.rgb * (1.0 / irradiance.a));
```

> `irradiance.a` 的作用是什么..？
>
> 很多权重我理解是为了视觉效果，应该和物理正确没什么太大关系...
> 
> 这里的也不是最终的版本，slides 里面提供了更加魔改的版本，不知道 RTXGI 里面是不是有更进一步的魔改

### 动态更新 probe 信息

每一帧，DDGI 会进行如下的操作：
1. generate and trace n primary rays from each of the m active probes in a scene,
storing geometry for (up to) n × m surface hits in a G-buffer-like structure of
surfels with explicit position and normals (Section 4.2);
2. shade the surfel buffer with direct and indirect illumination (Section 4.3), with
the same routine used to shade final image pixels, i.e., those directly visible
from the camera (Section 5); and
3. update the texels in the octahedral representations of the m active probes by
blending in the updated shading, distance, and square-distance results for each
of the n intersected surfels (Section 4.4).

### sampling

### 对比

- [Real-Time Global Illumination using Precomputed Light Field Probes](https://research.nvidia.com/sites/default/files/pubs/2017-02_Real-Time-Global-Illumination/light-field-probes-final.pdf)
  - McGuire 之前的工作