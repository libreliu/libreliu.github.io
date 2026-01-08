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

具体的，FT8 定义了如下消息编码：
- 123

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

TODO

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

### LDPC

### GMSK 调制