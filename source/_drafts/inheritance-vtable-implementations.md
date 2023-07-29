---
title: C++ 继承、虚函数与虚表实现
date: 2023-07-26
---

在调试程序的时候，常常会看到这样的现象：

```
(gdb) print this
$3 = (Pal::Queue * const) 0x5555559509b0
(gdb) print (dynamic_cast<Pal::Amdgpu::Queue*>(this))
$10 = (Pal::Amdgpu::Queue *) 0x7ffff7947cb8 <vtable for Pal::Amdgpu::Queue+16>
```

其中，Pal::Amdgpu::Queue 是 Pal::Queue 的子类。可以看到，这两个地址是不同的。

## 类的布局

## 子类的布局

## 含虚函数的父类和子类布局

