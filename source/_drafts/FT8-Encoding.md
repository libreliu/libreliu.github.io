---
title: FT8 编码和解码（一）
date: 2026-01-02
---

本系列文章讨论 FT8 编码和解码的基本原理。

## 参考实现

FT8 协议有多个公开的参考实现，涵盖了从源文本编码到完整的编码解码流程。以下是一些主要的实现：

- ARRL 参考：ARRL 提供了 FT8 协议编码的一些参考例程 [ft4_ft8_protocols.tgz](ft8/ft4_ft8_protocols.tgz)，使用 Fortran 语言编写。该实现包含了 FT8 的完整规范，包括源文本编码、CRC 校验、LDPC 编码等核心功能。
- WSJT-X：无需多言，但是库是 Fortran 的，看着比较痛苦。
- kgoba/ft8_lib: [https://github.com/kgoba/ft8_lib](https://github.com/kgoba/ft8_lib)
- G1OJS/PyFT8: https://github.com/G1OJS/PyFT8

## 编码

FT8 的编码过程大概分为如下步骤：
1. 源文本编码（Source Encoding）
2. 添加 CRC 校验位
3. 添加 LDPC 纠错位
4. 映射到符号序列，然后使用 GMSK 调制到载波

### 源文本编码

FT8 每帧可以传输 77 bit 的用户信息。

如果考虑 26 个英文字母，一个空格和 0 到 9 这 10 个数字，那么一共有 37 个 code。$ 77 / log_2(37) \approx 77 / 5.21 = 14.78 $，故而最简单的编码方式大致可以传输 14 个 code。

一般呼号有 6 位，这样两个呼号就是 12 位，加两个空格就不够了，更别说还要传输信号报告。故而，FT8 对于常用的 CQ 和响应格式都做了特殊的编码，以节约占用的比特数。

具体的，FT8 定义的消息编码可以参考 github.com:kgoba/ft8_lib 中 ft8\message.c 的 ftx_message_decode 函数。函数会先使用后面的 `i3` 来确定类型，对于 `i3` 位为 0 的信息，会根据前面的 `n3` 来确定具体的子类型。

#### 13 字符自由文本 -> f71

这个是最简单的一个，有个字符集

```c
/* strlen(f71_charset) = 42 */
const char f71_charset[] = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-./?";

int char_index(char c, char* charset) {
    int charset_len = strlen(charset);
    for (int i = 0; i < charset_len; i++) {
        if (charset[i] == c) {
            return i;
        }
    }
    return -1;
}
```

考虑到 $ \log_2(42^{13}) = 13 \log_2(42) = 70.10 $，所以最少采用 71 个 bit 进行存储，这也是 f71 名称的由来。

做法也很简单，设编码后的数为 $ x $，编码前第 i 处文字为 $t_i$，则

$$
x = \sum_{i=0}^{i \le 12} a_{i} * 42^{i}, \text{where} \ a_i = \text{char\_index}(t_i)
$$

实现上，可以用一个 `char mp_num[9]` 写一个简单的多位精度加法 & 乘法例程来算上面的编码。

#### 呼号 + 简语 -> c28

| Message fragment c28 as decimal integer | Decimal Range |
|-----------------------------------------|---------------|
| DE                                      | 0             |
| QRZ                                     | 1             |
| CQ                                      | 2             |
| CQ 000 – CQ 999                         | 3 – 1002      |
| CQ A – CQ Z                             | 1004 – 1029   |
| CQ AA – CQ ZZ                           | 1031 – 1731   |
| CQ AAA – CQ ZZZ                         | 1760 – 20685  |
| CQ AAAA – CQ ZZZZ                       | 21443 – 532443|
| 22-bit hash codes                       | 2063592 – (2063592 + 4194303) |
| Standard call signs                     | 6257896 – (6257896 + 268435455) |

简语部分转换如下：

- DE: 0
- QRZ: 1
- CQ: 2

其它可以类比参考上面的表格。

呼号部分的转换如下：

```c
const char a1[] = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const char a2[] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const char a3[] = "0123456789";
const char a4[] = " ABCDEFGHIJKLMNOPQRSTUVWXYZ";
```

转换得到的结果 `c28` 可以用下式计算：

```c
int NTOKENS=2063592, MAX22=4194304;
// note that NTOKENS + MAX22 = 6257896
int c28 = NTOKENS + MAX22 + 
        36*10*27*27*27 * char_index(t1, a1) +
        10*27*27*27 * char_index(t2, a2) + 
        27*27*27 * char_index(t3, a3) +
        27*27 * char_index(t4, a4) +
        27 * char_index(t5, a4) +
        char_index(t6, a4);
```

### CRC

#### CRC 光速复习

$ GF(2^n) $ 域的基本元素是系数在 $ GF(2) $ 中的多项式，以及用于定义乘法操作的不可约多项式 $ P(x) $。

快速复习可以参考 [密码学基础 - 05 有限域](https://blog.csdn.net/Stu_YangPeng/article/details/119329168) 中的相关内容。

CRC 的发送方式如下：

1. 假设带发送信息所对应多项式为 $ m(x) $
2. 计算 $ r(x) = m(x) * x^n \mod P(x) $，其中 $ P(x) $ 是 CRC 生成多项式。
3. 将 $ m(x) $ 与 $ r(x) $ 拼接起来，得到 $ c(x) = m(x) \cdot x^n + r(x) $，其中 $ n $ 是 $ P(x) $ 的次数。
4. 发送 $ c(x) $

CRC 的接收方式如下：

1. 假设接收到的信息所对应多项式为 $ c(x) $
2. 计算 $ r'(x) = c(x) \mod P(x) $
3. 如果 $ r'(x) = 0 $，则说明接收的信息是正确的，否则说明接收的信息是错误的。

证明：

$$
\begin{aligned}
r'(x) &= c(x) \mod P(x) \\
      &= (m(x) * x^n + r(x)) \mod P(x) \\
      &= ((m(x) * x^n) \mod P(x)) + (r(x) \mod P(x)) \\
&= (m(x) * x^n) \mod P(x) + (m(x) * x^n) \mod P(x) \\
&= 0 \text{ (根据 } GF(2^n) \text{加法运算的异或性质)}
\end{aligned}
$$

> 当然如何选择 P(x) 使得误差检查效果最好也是有讲究的。
> 
> 我们这里就先直接用吧。

#### FT8 中的 CRC

参考 QRZ Magazine 中的介绍：

> “CRC 是在源编码后的消息上计算，先将 77 bit 补零扩展到 82 bit。CRC 算法采用多项式 0x6757（十六进制），初始值为零。“

相应实现即可。

### LDPC

> 参考资料：
> 
> 1. [LDPC码介绍：原理&编码&译码 - 渺小的颗星的文章 - 知乎](https://zhuanlan.zhihu.com/p/1910039440455337476)
> 2. [LDPC Encoding](https://glizen.com/radfordneal/ftp/LDPC-2012-02-11/encoding.html)

对于一个 $K$ 位的数据串 $ V = [v_1, \dots, v_K] $，添加 $M$ 位校验串 $ C = [c_1, \dots, c_M] $，构成新的结果串 $ R = [v_1, \dots ,v_K, c_1, \dots ,c_M] $，其中 $N = K + M$ 是码字的总长度。

总串应该可以从数据串做 GF(2) 上的线性变换生成。定义生成矩阵 (generator matrix) $ \mathbf{G}_{K \times N} $，则 $ R = V \mathbf{G} $。

同时，定义校验矩阵 (check matrix) $ \mathbf{H}_{M \times N} $，则通过校验的结果串应该满足 $ \mathbf{H} R^T = 0 $。

那么，**对于任意的 V**，都有 $ \mathbf{H} R^T = \mathbf{H} G^T V^T = 0 $。

故而生成矩阵和校验矩阵需要满足 $ HG^T = 0 $。

举个例子，考虑 K = 3, M = 2 的情况，

$$
v_1 + v_2 + c_1 = 0 \\
v_1 + v_3 + c_2 = 0
$$

在这个例子中，校验矩阵 $ H $ 为：

$$
H = \begin{bmatrix}
1 & 1 & 0 & 1 & 0 \\
1 & 0 & 1 & 0 & 1
\end{bmatrix}
$$

但是，给定校验矩阵和 $ V $，应该如何得到生成矩阵和相应的校验码 $ C $ 呢？

#### 编码

对于线性码，系统编码 (systematic encoding) 是一种常见的编码方式，其中源消息的 K 位被直接复制到码字的某些位置（消息位），其余的 M=N-K 位（校验位）被设置为使结果成为码字。

从校验矩阵 $ H $ 得到生成矩阵 $ G $ 的过程并不像简单的求逆那样直接。实际上，对于系统编码，我们通常将校验矩阵 $ H $ 划分为两部分：

$$
H_{M \times N} = [A_{M \times M} | B_{M \times K}]
$$

那么，

$$
H R^T = A C^T + B V^T = 0
$$

$ A $ 可能是奇异或非奇异的。如果 $ A $ 是非奇异的，则

$$
C^T = -A^{-1} B V^T
$$

则

$$
R^T = \begin{bmatrix}
V^T \\
C^T
\end{bmatrix} 
= \begin{bmatrix}
V^T \\
-A^{-1} B V^T
\end{bmatrix} = \begin{bmatrix}
I_K \\
A^{-1}B
\end{bmatrix} V^T = G^T V^T
$$

容易看出，生成矩阵可以表示为：

$$
G = \begin{bmatrix}
I_K \\
A^{-1}B
\end{bmatrix}^T
$$

其中 $ I_K $ 是 K×K 的单位矩阵。

<!-- to think -->

生成矩阵的表示方法有三种：

1. **密集表示（dense representation）**：计算并存储 M×K 的矩阵 $ A^{-1}B $，使用密集格式。编码时，将源比特向量 $ s $ 与该矩阵相乘得到校验位。

2. **混合表示（mixed representation）**：存储 M×M 的矩阵 $ A^{-1} $（密集格式）和 M×K 的矩阵 $ B $（稀疏格式）。编码时，先将 $ s $ 与 $ B $ 相乘，再将结果与 $ A^{-1} $ 相乘。对于 LDPC 码，$ B $ 通常是稀疏的，这种方法可以提高速度。

3. **稀疏表示（sparse representation）**：避免显式计算 $ A^{-1} $，而是对 $ A $ 进行 LU 分解，得到下三角矩阵 $ L $ 和上三角矩阵 $ U $，使得 $ LU = A $。编码时，先计算 $ z = Bs $，然后通过前向替换求解 $ Ly = z $，再通过后向替换求解 $ Uc = y $ 得到校验位 $ c $。通过启发式方法重排 $ H $ 的行和列，可以保持 $ L $ 和 $ U $ 的稀疏性，从而提高计算速度。

#### 解码

解码的核心问题是，给定接收到的码字 $ R $，判断最有可能的源消息 $ V $。

这块主要有硬判决和软判决算法。TODO。

### GMSK 调制

