---
title: Linux 内核编程：笔记
date: 2023-08-04
---

> 本文部分内容由 GPT-4 生成，并进行了人工校对。

## 我的程序在什么上下文运行？

> Ref: 
> - https://www.cnblogs.com/sky-heaven/p/15953338.html
> - [Linux内核源代码情景分析](https://raw.githubusercontent.com/lancetw/ebook-1/master/03_operating_system/Linux%E5%86%85%E6%A0%B8%E6%BA%90%E4%BB%A3%E7%A0%81%E6%83%85%E6%99%AF%E5%88%86%E6%9E%90.pdf)
> - (TODO) ULK

粗略的说，为了分时地跑 “正常” 的 C 代码，我们需要：
- 稳定的寄存器值：代码本身被调度出去再恢复后，应该有相同的寄存器上下文
- 一个还算大的、专门的栈空间

粗略来说，内核有四种上下文：
- 进程的用户态上下文：某个 CPU 正常执行用户态程序时，就在这个上下文
  - 栈：某个进程虚拟地址空间的区域，描述信息在 `task_struct->mm->vm_area`
    > Related: ulimit 指定栈大小的机制是利用 heap 区域的缺页中断，然后向 mm 子系统要新页，直到到达设定的上限实现的
- 进程的用户态信号处理程序上下文：在内核态返回用户态时，有 pending 的 signal 从而需要执行信号处理程序的场合
  > Ref: http://courses.cms.caltech.edu/cs124/lectures-wi2016/CS124Lec15.pdf
  > - Note: this is for 2.6 kernel
  - 栈：使用用户态上下文的栈，栈顶额外保存如下信息
    - register state of interrupted process
    - other signal handler details
    - signal handler 的参数
    - sigreturn 的地址
      - 来保证函数执行后返回时 return 到一个 trampoline 上，syscall NR_sysreturn 进内核，然后恢复现场
- 进程的内核态上下文：某个 CPU 上的用户进程 syscall 进内核后使用的 stack
  - 栈：`task_struct->stack`，a.k.a. *内核栈*
    - 如果是从用户态进入内核态，或者该 task 在用户态，则内核栈是空的
    - 进程的内核态执行也可以被抢占 (Kernel 2.6+, Kernel Preempting) / 主动 yield
      > Ref: [Driver porting: the preemptible kernel - LWN.net](https://lwn.net/Articles/22912/) 
      - 内核代码可以主动关闭 / 恢复抢占，来保证临界代码的有序
        > 懒人做法 `spin_lock_irqsave`
  > TODO: Context saving
- 中断上下文
  - TODO: stack and context saving


## 我应该如何调试内核？

## 并发控制

### spinlock

### rcu

## 内存管理

### 内存分配

### 引用计数

## 常见数据结构

### 哈希表

在 `linux/hashtable.h` 中定义。

> Ref: [A generic hash table - LWN.net](https://lwn.net/Articles/510202/)

1. `DECLARE_HASHTABLE(name, bits)`: 声明并定义一个名为`name`、大小为 `2^bits` 的哈希表，该哈希表的数据类型包括一个数组和一个元素计数器。
2. `hash_init(table)`: 初始化名为`table`的哈希表，将所有桶(heads)的值设为NULL，表明哈希表为空。
3. `hash_add(table, node, key)`: 添加一个元素到哈希表。`table`是你的哈希表，`node`是你的哈希表节点，而`key`则是哈希键值。 
4. `hash_del(node)`: 删除哈希表中的一个元素。
5. `hash_empty(table)`: 检查哈希表是否为空。
6. `hash_for_each_possible(table, obj, member, key)`: 遍历所有可能哈希到同一个键(`key`)的元素。如果你的哈希函数可能返回多个桶(bucket)，那么这个函数会在所有可能的桶中搜索。
7. `hash_for_each_safe(table, bkt, tmp, obj, member)`: 安全地遍历哈希表中的元素。这是一个安全的宏，即使在遍历过程中删除元素，也不会出错。`bkt`保存的是哈希桶的索引，`tmp`用于临时存储链表项的信息，确保遍历的安全，`obj` 是元素的类型的一个指针，`member` 是哈希表节点在元素类型中的名字。
8. `hash_for_each(table, bkt, obj, member)`: 遍历哈希表中的元素，`bkt`用于存储当前桶的索引，`obj`是用户类型的一个指针，`member`是哈希表节点在用户类型中的名字。

此哈希表使用开放寻址法实现，因此在某个位置发生哈希冲突时，它会将新的元素存放到一个链表中。

### 链表

