---
layout: 'paper-reading'
title: '论文阅读 | 平衡精确度和预测范围的黑盒 GPU 性能建模'
date: 2022-11-30
papertitle: 'A mechanism for balancing accuracy and scope in cross-machine black-box GPU performance modeling'
paperauthors: James D. Stevens, Andreas Klockner
papersource: 'The International Journal of High Performance Computing Applications (April 2019)'
paperurl: 'https://arxiv.org/pdf/1904.09538.pdf'
status: Working
---

## 简介

本篇文章提出了一种跨机器，黑盒，基于微测试 (microbenchmark) 的方法来解析的对不同实现变体的 OpenCL kernel 的执行时间进行预测和最优 kernel 选择。

简单来说，本文大的思路是，收集一些核函数中出现的**特征**和对应特征在运行时会出现的**频率**，利用 microbenchmark 在目标平台上测量这些**特征**每次出现会花费的运行时间，再用一个（多重）线性模型来拟合最后的运行时间。

由于文章比较长，此处将文章的大概结构列举如下：
- Section 1: 简介
- Section 2: 解释性的例子
- Section 3: 本文贡献概况
- Section 4: 本文采用的假设和局限性
- Section 5: 收集核函数统计信息
- Section 6: 建模核函数执行时间
- Section 7: Calibrating Model Parameters
- Section 8: 结果展示
- Section 9: 作者调研到的、其它相关的性能建模方法

## 本文的假设和局限性

本文提到的一些 assumptions：
  - (usefulness) 可以帮助用户理解给定机器的性能特性，并且给优化器提供变体性能数据预测参考，同时降低需要在目标系统实际测量的数据数量
  - (accuracy) 根据检索到的相关文献显示，在本文提及的 GPU kernel 性能预测问题上，没有方法可以一致的获得小于个位数的预测误差，所以本文也设定这样的目标
  - (cost-explanatory): 和其它基于排名的方法不同 (Chen et al. (2018))，虽然本文优化的目标是在各种变体中进行选择，但是本文中模型的主要输出为运行时间，且采用比较可解释的线性模型进行建模

本文提到的一些局限：
  - 硬件资源的利用率：
    - 硬件资源的利用率会影响最终的性能。比如，峰值浮点性能受 SIMD lane 使用率影响，片上状态存储器 (VGPR, Scratchpad Memory) 会影响调度槽位的利用率，进而影响延迟隐藏的能力
    - 不过，采用本文的方法，基本的性能损失系数是比较容易解释和估计的。比如，实际的内存带宽利用率，以及峰值 FLOP/s
    - 即使无法达到硬件资源的全部利用，对于硬件资源利用率随参数变化相对稳定的场合，本文的模型仍然可以适用。不过对于变化的情况，让本文提出的模型适用的唯一可行方法，就是将模型的粒度调低到类似 SIMD lane 的水平，这样利用率的变化就不再相关了。ECM 系列模型就是这样考虑这个问题的。
      > ?
    - 为了简化的处理这个问题，本文采用 workgroup size 恒定为 256 的参数设定。
  - 程序建模上的简化：
    - 本文的模型中，主要检测的是基于某种特殊类别的操作 (e.g. 浮点操作，特殊类型的访存) 和检测到该特征出现的次数，其中次数被建模为 non-data-dependent 的一个特征。
      - Polyhedrally-given loop domain?
    - 所有分支指令都假设两个分支均会执行，即假设 GPU 采用 masking 的方式进行执行。
      > 文章认为这和 GPU 的行为是匹配的，不过显然不完全是。较新的 GPU 是同时支持 branching 和 masking 的。masking 存在的意义是对于短分支来说，可以不打断流水线。
  - 内存访问开销评估：
    - 内存访问的开销受到程序访问的局部性，以及对于 banked memory 来说的 bank 竞争问题的影响。
    - 本文将内存访问切分成了两种：
      - 对于各个程序都常见的，比较简单的访存模式，用 Section 6.1.1 的办法按 interlane stride, utilization radio 和 data width 进行分类
        > quasi-affine? 
      - 对于更复杂的访存模式，在 Section 7.1.1 中提供一种单独抽出来在循环里面按该模式进行访存，并且进行测量的机制
  - 平台无关：
    - 本文提出的系统作用于 OpenCL 上，但是相似的系统在 CUDA 上也可以比较轻松的实现。

## 收集核函数统计信息

### 计算每个特征的预期出现次数

前面提到，本文假设程序中出现的所有循环，其循环次数和本次运行所使用的数据无关，即 non-data-dependent。

这种情况下，如果要求解循环体中每个语句的运行次数，简单的做法是将所有循环展开，不过这样效率会比较低。事实上，此处可以把问题看作：在 $ d $ 维的整数空间 $ \mathrm{Z}^d $ 中，可行区域是由一些约束条件构成的超平面截出来的一个子区域，某个语句的循环次数就是在该子区域中整数格点的数目。

文章汇总提到，用 `barvinok` 和 `isl` 库一起，可以解决前面这个数循环体内语句执行次数的问题，其中 `barvinok` 是基于 Barvinok 算法的，这是一个比较高效的、计算有理凸多胞形中的格点数目的算法。

当然，还要分析好一条语句内真正进行计算或数据搬运的相应特征和次数。

> 为什么要抽象成有理凸多胞形？ 这是因为真正循环的次数和 Kernel 本身的一些参数，以及 Kernel 的 Launch parameters 也有关系，这里希望带着这些参数做符号计算，让模型更有用一些（比如说，优化这些参数会变得容易）

### 计数粒度 (count granularity)

计数粒度设计的思路是，计数出来的次数尽可能贴近真实 GPU 硬件中所执行操作的次数。

比如，我们知道，在 OpenCL 的调度模型中，每个 `sub-group` 会尽可能匹配 GPU 调度的最小单位，并且视硬件能力 `sub-group` 内部会支持一些 reduce 和 scatter 等原语，并且算数指令一般也是以 `sub-group` 为粒度进行调度和实现的。这样，算术指令就应该以 `sub-group` 为粒度计数。

当然，具体 `sub-group` 的数目是依赖具体的 Kernel launch parameters 的，不过这里对前面参数的依赖是多项式形式的 (比如 `work-group count / 32`），所以可以作为一个含参的量，让前面的循环次数计算也成为一个含参的值。

<!-- TOOD: check this paragraph -->

- per work-item
- per sub-group
  - 片上操作：算数指令和 local memory 访问
  - uniform 访问：global memory 访问，但是 `lid(0)` stride 0，即多个线程访问同一块内存区域
- per work-group

<!-- TODO: barrier -->

## 建模核函数执行时间

