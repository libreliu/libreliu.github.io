---
title: Unreal 变换速查表
date: 2025-03-26
---

Goal: 可视化，直观的显示各个仿射变换的特征点和例子，给出 View 中各个矩阵在测试用例下的速查表。

## 测试场景

> Unreal Engine 5.5.3

## 情景速查

场景树如下：

- Cube (`/Engine/BasicShapes/Cube`，即用 Place Actor 功能添加的最普通的 Cube)
  - Translation：(0, 0, 0)
  - Rotation: (0°, 0°, 0°)
  - Scale：(1, 1, 1)
- CameraActor
  - Translation：
  - Rotation：
  - Scale：
 
- BasePass 大小：
- 上采样大小：

> 其余未解释的参数参照 CDO 对应默认值。

Q: 这样是不是很没意思？因为都是最简单的，很多变换都被省略了。

A: debug 的问题是来源于很多变换的形式过于复杂，感觉这里的速查是给出最简单的复现条件和对应的值。

   同时，多个点本身可以确定一个变换（几个？），只要考察各个方向的变换的结果就可以（考察多少个？想想）

## 分类解释

### Local Position

Vertex Factory 所存储的相应模型在其本身内空间的表示形式。

### Translated World Position

Local Position 经过 PreViewTranslation 和 LocalToWorld 变换后的位置。

### ViewToClip

### NDC

