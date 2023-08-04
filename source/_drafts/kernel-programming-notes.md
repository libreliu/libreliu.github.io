---
title: Linux 内核编程：笔记
date: 2023-08-04
---

## 我的程序在什么上下文运行？

> Ref: 
> - https://www.cnblogs.com/sky-heaven/p/15953338.html

粗略的说，为了分时地跑 “正常” 的 C 代码，我们需要：
- 稳定的寄存器值：代码本身被调度出去再恢复后，应该有相同的寄存器上下文
- 一个还算大的、专门的栈空间

粗略来说，内核有三种上下文：
- 进程的用户态上下文：某个 CPU 正常执行用户态程序时，就在这个上下文
  - 栈：某个进程虚拟地址空间的区域，描述信息在 `task_struct->mm->vm_area`
    > Related: ulimit 指定栈大小的机制是利用 heap 区域的缺页中断，然后向 mm 子系统要新页，直到到达设定的上限实现的
  - 寄存器保存 / 恢复区域：`task_struct->thread_struct` (每种体系结构不同)
- 进程的内核态上下文：某个 CPU 上的用户进程 syscall 进内核后使用的 stack
  - 栈：`task_struct->stack`，a.k.a. *内核栈*
    - 如果是从用户态进入内核态，或者该 task 在用户态，则内核栈是空的
    - 进程的内核态执行也可以被抢占 (Kernel 2.6+, Kernel Preempting) / 主动 yield
      > Ref: [Driver porting: the preemptible kernel - LWN.net](https://lwn.net/Articles/22912/) 
      - 内核代码可以主动关闭 / 恢复抢占，来保证临界代码的有序
        > 懒人做法 `spin_lock_irqsave`
  - 寄存器保存 / 恢复区域：TODO
- 中断上下文
  - TODO

