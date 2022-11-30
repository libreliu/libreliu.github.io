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

# 简介

本篇文章提出了一种跨机器，黑盒，基于微测试 (microbenchmark) 的方法来解析的对不同实现变体的 OpenCL kernel 的执行时间进行预测和最优 kernel 选择。

由于文章比较长，此处将文章的大概结构列举如下：
- Section 1: 简介
- Section 2: Illustrative Example
- Section 3: 本文贡献概况
- Section 4: 本文采用的假设和局限性
  - 一些假设
    - (usefulness) 可以帮助用户理解给定机器的性能特性，并且给优化器提供变体性能数据预测参考，同时降低需要在目标系统实际测量的数据数量
    - (accuracy) 根据检索到的相关文献显示，在本文提及的 GPU kernel 性能预测问题上，没有方法可以一致的获得小于个位数的预测误差，所以本文也设定这样的目标
    - (cost-explanatory): 和其它基于排名的方法不同 (Chen et al. (2018))，虽然本文优化的目标是在各种变体中进行选择，但是本文中模型的主要输出为运行时间，且采用比较可解释的线性模型进行建模
  - 一些局限
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
- Section 5: Gathering Kernel Statistics
- Section 6: Modeling Kernel Execution Time
- Section 7: Calibrating Model Parameters
- Section 8: 结果展示
- Section 9: 作者调研到的、其它相关的性能建模方法