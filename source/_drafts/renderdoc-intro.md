---
title: RenderDoc 源码分析
date: 2022-09-27
---

# RenderDoc 源码分析

> 本文基于 [commit dff0196](https://github.com/baldurk/renderdoc/commit/dff0196bfbd3a30c1f04435692b83aa96c1728f0) 进行分析，这是笔者写作时 v1.x 分支的最新提交。

## 工程一览

用于 Windows 平台构建的 `renderdoc.sln` 包含的工程如下：

- UI:
  - `qrenderdoc`
  - Python modules
    - `pyrenderdoc_module`
    - `qrenderdoc_module`
- drivers:
  - IHV
    - `AMD`
    - `ARM`
    - `Intel`
    - `NV`
  - shaders
    - `dxbc`
    - `dxil`
    - `spirv`
  - `d3d11`
  - `d3d12`
  - `d3d8`
  - `d3d9`
  - `dxgi`
  - `gl`
  - `vulkan`
- `renderdoc`
- Utility
  - `renderdoccmd`
  - `renderdocshim`
  - `renderdocui_stub`
  - `version`

