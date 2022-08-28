---
layout: 'paper-reading'
title: '论文阅读 | 基于物理的特征线渲染'
date: 2022-08-28
papertitle: 'Physically-based Feature Line Rendering'
paperauthors: Rex West
papersource: 'SIGGRAPH Asia 2021'
paperurl: 'http://lines.rexwe.st/'
status: Working
---

## 简介

本篇文章介绍了基于物理的特征线渲染方法。

特征线渲染是一种非真实感渲染技术，常常被用在剪影、产品效果图等一些需要特殊的艺术效果的场合。

## 贡献

本篇文章提出的，基于路径方法的特征线渲染方法，是基于如下的两方面观察：
1. 从路径的角度出发，现有的特征线渲染方法将特征线处理成了光源
2. 特征线相交测试可以对任意的边开展，而不仅仅是在屏幕空间中

基于上面的观察，本文提出的方法
1. 对一整个路径中每条路径段分别进行和特征线的相交测试
2. 将交到的特征线视为吸收所有入射光，然后辐射用户自定义颜色的光源

具体来说，

## 效果

## 未来的工作

