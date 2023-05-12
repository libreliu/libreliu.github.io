---
layout: 'paper-reading'
title: '论文阅读 | 利用对象层次结构的数据并行路径追踪'
date: 2023-05-09
papertitle: 'Data Parallel Path Tracing with Object Hierarchies'
paperauthors: Ingo Wald, Steven G. Parker
papersource: 'HPG 2022'
paperurl: 'https://dl.acm.org/doi/abs/10.1145/3543861'
status: Working
---

本文提出了一种同时支持空间和对象层次结构两种划分方式的，新的场景数据划分方法。同时，利用多种减少数据通信的策略，本文的方法可以同时实现降低通信开销、降低内存占用、增加性能的目标，进而可以实现在相对低端的互联网络上实现 interactive 级别的渲染性能。

## 多 GPU 渲染现状调研

从渲染农场提供的支持软件清单入手：

- [FoxRenderFarm](www.foxrenderfarm.com) or [RenderBus (国内版)](https://www.renderbus.com/)


MoonRay: DreamWorks inhouse renderer
- Arras: https://docs.openmoonray.org/getting-started/about/

Maya: Popular DCC
- Network rendering: https://help.autodesk.com/view/MAYAUL/2023/ENU/?guid=GUID-1033628A-9D1E-447F-ABEB-DCA359AB1D54
  - NFS like system, batch jobs, doesn't seems to have parallel strategies other than embarrassly parallel jobs

Arnold: Arnold: A Brute-Force Production Path Tracer
- https://www.arnoldrenderer.com/research/Arnold_TOG2018.pdf

vray: vray 

- Maya
- 3ds Max
- Maxon Cinema 4d
- Blender
- Unreal Engine
- V-Ray
- Redshift
- Arnold
- Corona
- RenderMan
- Clarisse
- anima
- Forest Pack
- RailClone
- X-Particles
- Miarmy

## 核心思想

