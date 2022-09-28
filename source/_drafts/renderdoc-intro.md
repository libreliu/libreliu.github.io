---
title: RenderDoc 源码分析
date: 2022-09-27
---

# RenderDoc 源码分析

> 本文基于 [commit dff0196](https://github.com/baldurk/renderdoc/commit/dff0196bfbd3a30c1f04435692b83aa96c1728f0) 进行分析，这是笔者写作时 v1.x 分支的最新提交。

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

## `renderdocshim`

`renderdocshim` 是一个只使用 WinAPI，不用 C 运行时库的中间层。

- RenderDoc 会加一个全局 Hook 来预装载该 shim dll (?)
- 在作为 EntryPointSymbol 的 `dll_entry` 处，若 `reason_for_call` 为 `DLL_PROCESS_ATTACH` 类型，则
  1. 加载由 renderdoc 预先创建好的，由具名共享内存机制 ([MSDN - Name Shared Memory](https://learn.microsoft.com/en-us/windows/win32/memory/creating-named-shared-memory)) 传递的参数结构体 `ShimData`
  2. 从其中读取 `pathmatchstring` 并检测该可执行程序的文件名中是否含有 `pathmatchstring`
     - 若有，则用 `LoadLibraryW` 装载 RenderDoc，并且调用 RenderDoc DLL 中的 `INTERNAL_SetCaptureOptions`，`INTERNAL_SetLogFile`，`INTERNAL_SetDebugLogFile` 来根据 ShimData 中数据设置对应项
     - 否则，清场撤退

## 公用 Hook 设施

Hook 设施的文档在 `hooks/hooks.h` 中有比较详尽的说明。

```c
// == Hooking workflow overview ==
//
// Each subsystem that wants to hook libraries creates a LibraryHook instance. That registers with
// LibraryHooks via the singleton in global constructors, but does nothing initially.
//
// Early in init, during RenderDoc's initialisation, the last thing that happens is a call to
// LibraryHooks::RegisterHooks(). This iterates through the LibraryHook instances and calls
// RegisterHooks on each of them.
//
// Each subsystem should call LibraryHooks::RegisterLibraryHook() for the filename of each library
// it wants to hook, then LibraryHooks::RegisterFunctionHook() for each function it wants to hook
// within that library. Note that not all platforms will use all the information provided, but only
// in a way that's invisible to the user. These are lightweight calls to register the hooks, and
// don't do any work yet.
//
// A registered library hook can get an optional callback when that library is first loaded.
//
// Similarly a registered function hook can provide a function pointer location which will be filled
// out with the function pointer to call onwards. This may just be the real implementation, or a
// trampoline, depending on the platform hooking method.
//
// Once all of this is completed, these hooks will be applied and activated as necessary. If any
// libraries are already loaded, library callbacks will fire here. Similarly function hook original
// pointers will be filled out if they are already available. Library callbacks will fire precisely
// once, the first time the library is loaded.
//
// NOTE: An important result of the behaviour above is that original function pointers are not
// necessarily available until the function is actually hooked. The hooking will automatically
// propagate all functions hooked in a library once it's loaded, and since some platforms may
// trampoline-hook target functions it is *not* safe to just get the target function's pointer as
// this may then call back into hooks. The only exception to this is with a library-specific
// function for fetching pointers such as GetProcAddress on OpenGL/Vulkan. However in this case care
// must be taken to suppress any effect of function interception by calling the relevant suppression
// functions. This ensures that if the API-specific GetProcAddress calls into the platform function
// fetch, it doesn't form an infinite loop.
//
// Also in the case that a function may come from many libraries, or it has multiple aliased names,
// the order of registration is important. The hooking implementations will always follow the order
// provided as a priority list, so if you register libFoo before libBar, any functions in libFoo
// have precedence. Similarly if you register foofunc() before barfunc() but pointed to the same
// pointer location for storing the original function pointer, barfunc()'s pointer will not
// overwrite foofunc() if it exists.
//
// == Hooking details (platform-specific) ==
//
// The method of hooking varies by platform but follows the same general pattern. During
// registration we build up lists of which libraries and functions are to be hooked. Once the
// registration is complete we apply all of the hooks.
//
// NOTE: The library name for function hooks is only used on windows, since on linux/android
// namespace resolution is a bit fuzzier. At the time of writing there are no cases where two
// libraries have the same function that aren't functionally equivalent.
//
// - Windows -
// On windows this involves iterating over all loaded libraries and hooking their IAT tables. We
// also hook internally any functions for dynamically loading libraries or fetching functions, so
// that we can continue to re-wrap any newly loaded libraries.
//
// Loaded libraries at startup (most likely because the exe linked against them) have their
// callbacks fired immediately. Otherwise any time a new library is found on a subsequent iteration
// from a LoadLibrary-type call we fire the callback.
//
// Whenever a library is newly found, we hook all the entry points and update any original function
// pointers that are set to NULL.
//
// - Linux -
// On linux we rely on exporting all hooked symbols, and using LD_PRELOAD to load our library first
// in resolution order. All we do is hook dlopen so that when a new library is loaded we can
// redirect the returned library handle to ourselves, as well as process any pending function hooks.
//
// - Android -
// On android the implementation varies depending on whether we're using interceptor-lib or not.
// This is optional at build time but produces more reliable results:
//
// Without interceptor-lib:
// The implementation is similar to windows. Since we don't have LD_PRELOAD we need to patch import
// tables of any loaded libraries. We also cannot reliably hook dlopen on android to redirect the
// library handle to ourselves, so instead we hook dlsym and check to see if it corresponds to a
// function we're intercepting. This is the need for the 'suppress hooking' function, since if
// eglGetProcAddress calls into dlsym we don't want to intercept that dlsym and return our own
// function.
//
// With interceptor-lib:
// Instead of patching imports we overwrite the assembly at each entry point in the *target*
// library, and patch it to call into our hooks. Then we create trampolines to restore the original
// function for onwards-calling.
//
// To ensure sanity, we always load all registered libraries in the first hook applying phase. This
// ensures that we don't end up in a weird situation where one library is loaded, not all functions
// are hooked, the user code tries to populate any missing functions and then later another library
// is loaded and we patch it after having requested function pointers. Ensuring all libraries that
// we *might* patch are loaded ASAP, everything is consistent since after that any functions that
// don't have trampolines provided will never be trampolined in the future.
//
// Sometimes interceptor-lib can fail, at which point we fall back to the path above for those
// functions and try to follow and patch any imports to them.
```

所有要 Hook 的函数会继承 `LibraryHook` 类。

