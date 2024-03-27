---
layout: 'paper-reading'
title: '论文阅读 | 使用表达式树为用于稀疏操作的代码优化'
date: 2023-03-17
papertitle: 'Sparsity-Specific Code Optimization using Expression Trees'
paperauthors: Philipp Herholz, Xuan Tang, Teseo Schneider, Shoaib Kamil, Daniele Panozzo, Olga Sorkine-Hornung
papersource: 'ACM ToG 2022'
paperurl: 'https://dl.acm.org/doi/10.1145/3520484'
status: Working
---

本篇文章实现了一个对使用稀疏数据的算法的代码做优化的优化器，该优化器可以将未优化的、使用 C++ 编写的操作稀疏数据的算法代码变换为并行的、使用 CPU / GPU 进行运算的运算核函数。该方法依赖固定的进行稀疏计算的计算模式。

## 概要

本文章提出的方法需要对 C++ 代码进行如下变换：
1. Symbolic execution (Section 4.7 & 4.9)
   - 第一步是执行将要被编译的代码。在这步之后，每个输出变量都包含有一个可以对任意输入变量的值进行某种指派后，可以输出值的 expression tree
   - 本步骤结束后会得到一系列表达式
2. Expression decomposition (Section 4.2)
   - 根据每个表达式节点的引用和其复杂度，决定哪些子表达式将会独立求值， with their result stored in variables (intermediate expressions)
4. Expression grouping (Section 4.3)
   - 所有输出和 intermediate expressions 要根据结构进行分组。每个组都开一个单独的 kernel 进行计算，no group member can depend on a result of another member
5. Leaf harvesting (Section 4.4)
   - ？
7. Expression optimization (Section 4.5)
8. Code generation (Section 4.8)

上面的方法对于问题的相关算法也是有要求的：
1. Limited conditional branching
2. Overhead amortization
3. Expression tree variation



https://github.com/PhHerholz/SymbolicLib
https://eigen.tuxfamily.org/dox/unsupported/group__SparseExtra__Module.html#ga35610696b22ae58bdd51d96468956455
https://math.nist.gov/MatrixMarket/formats.html

### Expression decomposition

On a local level, we consider the template expression of each kernel. We identify subtrees that exceed a complexity threshold and appear multiple times in the expression. These subtrees will be evaluated only once with their result stored in a local stack variable for further reference.

On a global level, we consider all output expressions and find subtrees that are shared by more than one of them potentially leading to faster execution times.