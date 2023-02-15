---
layout: 'paper-reading'
title: '论文阅读 | 平衡精确度和预测范围的黑盒 GPU 性能建模'
date: 2023-02-16
papertitle: 'A mechanism for balancing accuracy and scope in cross-machine black-box GPU performance modeling'
paperauthors: James D. Stevens, Andreas Klockner
papersource: 'The International Journal of High Performance Computing Applications (April 2019)'
paperurl: 'https://arxiv.org/pdf/1904.09538.pdf'
status: Complete
---

## 简介

本篇文章提出了一种跨机器，黑盒，基于微测试 (microbenchmark) 的方法来解析的对不同实现变体的 OpenCL kernel 的执行时间进行预测和最优 kernel 选择。

简单来说，本文大的思路是，收集一些 kernel 中出现的**特征**和对应特征在运行时会出现的**频率**，利用 microbenchmark 在目标平台上测量这些**特征**每次出现会花费的运行时间，再用一个（多重）线性模型来拟合最后的运行时间。

由于文章比较长，此处将文章的大概结构列举如下：
- Section 1: 简介
- Section 2: 解释性的例子
- Section 3: 本文贡献概况
- Section 4: 本文采用的假设和局限性
- Section 5: **收集 kernel 统计信息**
- Section 6: **建模 kernel 执行时间**
- Section 7: **校准模型参数**
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

## 收集 kernel 统计信息

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

粒度有如下三种：
- per work-item
  - 同步障操作 (barrier synchronization)
- per sub-group （subgroup size 需要用户提供）
  - 片上操作：算数指令和 local memory 访问
  - uniform 访问：global memory 访问，但是 `lid(0)` stride 0，即多个线程访问同一块内存区域
- per work-group （没有给出例子）

> 这里的讨论很不详细，需要和下面一起看

## 建模 kernel 执行时间

$$
T_\text{wall}({\bf n}) = \text{feat}^\text{out}({\bf n}) \approx g(\text{feat}^\text{in}_0({\bf n}), ..., \text{feat}^\text{in}_j({\bf n}), p_0, ..., p_k)
$$

其中：
- $ {\bf n} $ 是整个计算过程中为常数的、仅与各种变体相关的整数向量
- $ \text{feat}^\text{in}_j({\bf n}) $ 是某种单元特征的出现次数（比如单精度 FP32 乘法数）
- $ p_i $ 是硬件相关的校正参数
- $ g $ 是用户提供的可微函数

### kernel 特征

#### 数据移动特征

对于大多数计算 kernel 来说，数据搬运所占的开销是大头。

内存访问模式：
- 内存类别：global / local
- 访问类型：load / store
- the local and global strides along each thread axis in the array index
  - 也就是说，每次 `gid(0)`, `gid(1)`, `lid(0)`, `lid(1)` 自增一的时候，对 array 数组访问的偏移要分别增加多少
- the ratio of the number of element accesses to the number of elements accessed (access-to-footprint ratio, or AFR)
  - `AFR = 1`: every element in the footprint is accessed one time
  - `AFR > 1`: some elements are accessed more than once
    - 这样 Cache 就可能会对速度有加成了

> 文章中提到，解析形式的模型需要建模很多机器细节，比如 workgroup 调度，内存系统架构等，来达到和黑盒模型相似的精度。一个例子是
>
> ```c
> for (int k_out = 0; k_out <= ((-16 + n) / 16); ++k_out)
>   ...
>   a_fetch[...] = a[n*(16*gid(1) + lid(1)) + 16*k_out + lid(0)];
>   b_fetch[...] = b[n*(16*k_out + lid(1)) + 16*gid(0) + lid(0)];
> ```
> 
> 这个例子里面的内存访问模式如下：
> | Array | Ratio | Local strides | Global strides | Loop stride |
> |-------|-------|---------------|----------------|-------------|
> | a     | n/16  | {0:1, 1:n}    | {0:0, 1:n*16}  | 16          |
> | b     | n/16  | {0:1, 1:n}    | {0:16, 1:0}    | 16*n        |
>
> 这两个例子的性能差距在 5 倍左右。

With this approach, a universal model for all kernels on all hardware based on kernel-level features like ours  could need a prohibitively large number of global memory access features and corresponding measurement kernels. This motivates our decision to allow proxies of “in-situ” memory accesses to be included as features, which in turn motivates our ‘work removal’ code transformation, discussed in Section 7.1.1. This transformation facilitates generation of microbenchmarks exercising memory accesses which match the access patterns found in specific computations by stripping away unrelated portions of the computation in an automated fashion.

Specifying Data Motion Features in the Model: 弄个 aLD, bLD, f_mem_access_tag

也可以手动指定，不用运行时测量：

```python
model = Model(
  "f_cl_wall_time_nvidia_geforce",
  "p_f32madd * f_op_float32_madd + "
  "p_f32l * f_mem_access_local_float32 + "
  "p_f32ga * f_mem_access_global_float32_load_lstrides:{0:1;1:>15}_gstrides:{0:0}_afr:>1 + "
  "p_f32gb * f_mem_access_global_float32_load_lstrides:{0:1;1:>15}_gstrides:{0:16}_afr:>1 + "
  "p_f32gc * f_mem_access_global_float32_store"
)
```

显式语法格式如下：`"f_mem_access_tag:<mem access tag>_<mem type>_<data type>_<direction>_lstrides:{<local stride constraints>}_gstrides:{<global stride constraints>}_afr:<AFR constraint>"`

#### 算术操作特征

特征：
- 操作类型：加法、乘法、指数
- 数据类型：float32, float64

本文中的工作不考虑整数算术特征，因为在模型考虑的 kernel 变体中，整数算术只用在了数组下标计算中。

#### 同步特征

特征：
- 局部同步障 (local barriers)
- kernel 启动

这里 Local barriers 是 per work-item 的，然后根据实际程序同步的需要，可能需要进行乘以同时进行同步的 work item 数量。

简单来说就是，认为参与同步的 thread 越多越耗时。

> Recall that the statistics gathering module counts the number of synchronizations encountered by a single work-item, so depending on how a user intends to model execution, they may need to multiply a synchronization feature like local barriers by, e.g., the number of work-groups, a feature discussed in the next section.
> 
> A user might incorporate synchronization features into this model as follows:
> 
> ```python
> model = Model("f_cl_wall_time_nvidia_geforce",
>   "p_f32madd * f_op_float32_madd + "
>   ...
>   "p_barrier * f_sync_barrier_local * f_thread_groups + "
>   "p_launch * f_sync_kernel_launch"
> )
> ```
> 

### 其他特征

- Thread groups feature
  - 给定 workgroup count，进行不同 workgroup count 间启动时间补偿
- OpenCL wall time feature
  - 给定 platform 和 device 下，执行 60 遍获得平均 walltime，作为输出特征
  - "We measure kernel execution time excluding any host-device transfer of data."

一个完整的模型：
```python
model = Model("f_cl_wall_time_nvidia_geforce",
  "p_f32madd * f_op_float32_madd + "
  "p_f32l * f_mem_access_local_float32 + "
  "p_f32ga * f_mem_access_global_float32_load_lstrides :{0:1;1:>15}_gstrides:{0:0}_afr:>1 + "
  "p_f32gb * f_mem_access_global_float32_load_lstrides :{0:1;1:>15}_gstrides:{0:16}_afr:>1 + "
  "p_f32gc * f_mem_access_global_float32_store + "
  "p_barrier * f_sync_barrier_local * f_thread_groups + "
  "p_group * f_thread_groups + "
  "p_launch * f_sync_kernel_launch"
)
```

## 校准模型参数

Work Removal Transformation: a code transformation that can extract a set of desired operations from a given computation, while maintaining overall loop structure and sufficient data flow to avoid elimination of further parts of the computation by optimizing compilers

Work Removal 变换会把 on-chip 工作从 kernel 中去掉，达成两方面目的：
1. 测试 on-chip work 和 global memory access 各自占用时间，决定是否要进行 latency hiding
2. 测试某种特殊访存模型的时间占用

### Measurement kernel 设计

- Global memory access
  - AFR = 1: Fully specified by local strides, global strides, data size
    - That is, patterns that do not produce a write race and not nested inside sequential loops
    - Performs global load from each of *a variable number of input arrays* using the specified access pattern
    - Each work-item then stores the sum of the input array values it fetched in a single result array
    - Params: data type, global memory array size, work-group dimensions, number of input arrays, thread index strides
  - AFR > 1:
    - Use **Work Removal Tranformation** to generate dedicated measurement kernel.
- Arithmetic operations
  - First, have each work-item initialize 32 private variables of the specified data type
  - Then, perform a loop in which each iteration updates each variable using the target arithmetic operation on values from other variables
    - This is to create structural dependency
  - We **unroll the loop by a factor of 64** and **arrange the variable assignment order** to achieve high throughput using the approach found in the Scalable HeterOgeneous Computing (SHOC) OpenCL MaxFlops.cpp benchmark (Danalis et al. 2010).
    - the 32 variable updates are ordered so that **no assignment depends on the most recent four statements**
      - 32 is used because it permits maximum SIMD lane utilization & prevent from spilling too many registers
    - we **sum** the 32 variable values and **store the result in a global array** according to a **user-specified memory access pattern**
      - (NOTE: The actual cost can be deduced by change the runcount of arithmetic ops)
      - include the global store to avoid being optimized away
- Local memory access
  - Tags: data type, global memory array size, iteration count, and workgroup dimensions
    - Data type determines the local data stride
  1. each workitem **initializes one element of a local array** to the data type specified
  2. Then we have it perform a loop, at each iteration moving a different element from one location in the array to another. 
     - We avoid write-races and simultaneous reads from a single memory location, and use an lid(0) stride of 1, avoiding bank conflicts.
  3. After the loop completes, **each work-item writes one value from the shared array to global memory**
- Other features
  - executes a variable number of local barriers, to measure operation overlapping behaviour (**Section 7.4**)
  - Empty kernel launch, to measure kernel launching overhead

文章提出，*Using a sufficiently high-fidelity model, we expect that users will be able to differentiate between latency-based costs of a single kernel launch and throughput-related costs that would be incurred in pipelined launches.*

> 怎么做？

### 计算模型参数

采用最小二乘法来进行拟合，得到 feature 向量中给定 feature 的出现次数和总的运行时间的关系。

### Operation Overlap 建模

Global memory 和 On-chip 的延迟之间是有可能互相隐藏的。

本文的建模基于简单的想法，即 $ \max (c_{onchip}, c_{gmem}) $，两类操作的时间求 $ \max $ 操作。

不过 $ \max $ 不是很可导，所以采用一个可微的近似函数来做，详情可以看论文。


