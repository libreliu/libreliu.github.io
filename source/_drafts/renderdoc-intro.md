---
title: RenderDoc 源码分析
date: 2022-09-27
---

# RenderDoc 源码分析

> 本文基于 [commit dff0196](https://github.com/baldurk/renderdoc/commit/dff0196bfbd3a30c1f04435692b83aa96c1728f0) 进行分析，这是笔者写作时 v1.x 分支的最新提交。
> 本文默认跟踪 Windows 平台下的实现。

## 相关资料

1. RenderDoc 仓库中 `docs/` 所带文档
2. crossous 在简书的文章
   - [【渲染逆向】Hook D3D API - 简书](https://www.jianshu.com/p/3385f26bd52e)
   - [【渲染逆向】RenderDoc hook与capture流程分析 - 简书](https://www.jianshu.com/p/8b1bb90c5630)

<!-- https://github.com/SeanPesce/DLL_Wrapper_Generator -->
<!-- https://github.com/SeanPesce/d3d11-wrapper -->

## 工程一览

用于 Windows 平台构建的 `renderdoc.sln` 包含的工程如下：

- UI:
  - `qrenderdoc`
  - Python modules
    - `pyrenderdoc_module`
    - `qrenderdoc_module`
- drivers: 下面每一个会编译成为一个静态库，然后链接到 `renderdoc.dll`
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
- `renderdoc`: networking, os 相关, replay, 资源管理等功能；与上面所有 drivers 链接在一起成为 `renderdoc.dll`
- Utility
  - `renderdoccmd`
  - `renderdocshim`
  - `renderdocui_stub`
  - `version`

## `renderdocshim`

`renderdocshim` 是一个只使用 WinAPI，不用 C 运行时库的中间层。

- RenderDoc 会加一个全局 Hook 来预装载该 shim dll (?)
- 在作为 EntryPointSymbol 的 `dll_entry` 处，若 `reason_for_call` 为 `DLL_PROCESS_ATTACH` 类型，则
  1. 加载由 renderdoc 预先创建好的，由具名共享内存机制 ([MSDN - Name Shared Memory](https://learn.microsoft.com/en-us/windows/win32/memory/creating-named-shared-memory)) 传递的参数结构体 `ShimData`
  2. 从其中读取 `pathmatchstring` 并检测该可执行程序的文件名中是否含有 `pathmatchstring`
     - 若有，则用 `LoadLibraryW` 装载 RenderDoc，并且调用 RenderDoc DLL 中的 `INTERNAL_SetCaptureOptions`，`INTERNAL_SetLogFile`，`INTERNAL_SetDebugLogFile` 来根据 ShimData 中数据设置对应项
     - 否则，清场撤退

## `renderdoc`

DLL 入口点位于 `os/win32/win32_libentry.cpp`，主要是检测 Replay 模式，然后进行初始化。

DLL 中有一个单例对象 `RenderDoc`，负责一些中心化的状态。

### `RenderDoc::Inst().Initialise()`

初始化的事情，先跳过。

### Hook 设施初始化 - `LibraryHooks::RegisterHooks()`

Hook 设施的文档在 `hooks/hooks.h` 的注释中有比较详尽的说明。

每种类型的 Hook （e.g. 在 `d3d11_hooks.cpp` 中的 `D3D11Hook`） 都会继承 `LibraryHook` 类，并且实现 `RegisterHooks()` 方法。`LibraryHook::LibraryHook()` 方法会获取全局函数 `LibList()` 中的静态列表 `libs`，并且将自己添加到这个静态的列表中。

单例类 `LibraryHooks` 的 `LibraryHooks::RegisterHooks()` 方法则会调用所有注册在 `LibList` 中的对象的 `RegisterHooks()` 方法。

## drivers

### `d3d11`

`d3d11` 这个 driver 负责 Direct3D 11 的 API 截获与抓帧。

首先看，在其 `RengisterHooks()` 中实现了对 `D3D11CreateDevice` 和 `D3D11CreateDeviceAndSwapChain` 两个函数的截获。

- `D3D11Hook` 在 `RengisterHooks()` 中注册了对 `d3d11.dll` 中 `D3D11CreateDevice` 和 `D3D11CreateDeviceAndSwapChain` 两个函数的钩子
	- 当第一次被调用时，调用 `Create_Internal()`; 同时注意检查递归调用的情况，以防其它程序也在 Hook D3D 的东西，然后又被这边的钩子捕获
- 如果是 `D3D11CreateDevice`，就认为 Swapchain 相关参数为 `NULL`；同时根据捕获设定来 Patch DXGI_SWAP_CHAIN_DESC (allowFullscreen 之类的)
- 将调用转发到真的 `D3D11CreateDeviceAndSwapChain` 函数当中去，把创建好的 `ID3D11Device` 包到 `WrappedID3D11Device` 当中去
  - 如果也创建了 `IDXGISwapChain` (i.e. 指定了 SwapChain 的描述符并且被接受了)，则把其包到 `WrappedIDXGISwapChain4` 当中去

> NOTE: `WrappedIDXGISwapChain4` 在 `dxgi` 这个 driver 下面的 `dxgi_wrapped.cpp` 中

Direct3D 11 主要通过[两种类型设备上下文](https://learn.microsoft.com/en-us/windows/win32/direct3d11/overviews-direct3d-11-render-multi-thread-render)来向用户提供渲染数据的提交接口：Immediate Context 和 Deferred Context。这两种接口的类型均为 `ID3D11DeviceContext`。

通过 `ID3D11Device::GetImmediateContext` 可以获取用于即时绘制的设备上下文。在 RenderDoc 中，真实设备的即时绘制上下文在 `WrappedID3D11Device` 创建时，就从真实的设备中拿到，并且用 `WrappedID3D11DeviceContext` 来包装好了。
