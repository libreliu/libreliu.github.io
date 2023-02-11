---
title: Mesa Vulkan radv 驱动流程整理
date: 2023-02-11
---

本文的主要目的是，记录笔者调试和跟踪代码过程中的发现。

笔者本人接触 Linux 图形栈的时间并不很长，其中很多地方还不甚明了，如有缺漏之处，请批评指正。

您可以在博客对应的[仓库](https://github.com/libreliu/libreliu.github.io) 的 Issue 区和我取得联系。

> 本文的实验均开展于截至写作时最新版本的 Arch Linux。

## 前言：如何跟踪 Linux 图形栈？

截至目前，笔者认为图形栈的跟踪和开发，较常规的 Linux 服务端开发等工作要更为复杂。

这种复杂性主要来源于：

1. 厂商图形实现是高度定制化的，在通用图形 API (e.g. Vulkan, OpenGL) 下，厂商有很大的自由度来填补从用户程序图形 API 到真正向图形处理器发送命令的过程
   - e.g. AMD 的 mesa Vulkan 开源驱动 radv 会经过 vulkan-icd-loader 到 mesa 到 libdrm 到内核态 amdgpu
2. 用户的图形应用程序还需要经过窗口系统和混成器 (compositor) 才能显示到屏幕上，图形实现需要和混成器紧密配合
   - X11 (DIX, DDX), GLX, DRI2, DRI3, Wayland, egl...
   - 历史包袱比较多

除此之外，上面的两个方面，其中各个环节的接口文档都不甚清晰，且接口演进也比较频繁，很多时候需要「一竿子捅到底」，将各个库和软件的源码连在一起阅读，才知道真正发生了什么。

### 源码阅读

针对这种情况，首先需要比较方便的 C/C++ 源码阅读软件，笔者目前使用的是 OpenGrok。

该软件对源码的语义理解并不很强，因为其仅仅是采用 ctags 的方法进行简单的解析，对于需要经过预处理器的一些嵌入的宏 （比如 `#define WSI_CB(cb) PFN_vk##cb cb` 这种样式的成员定义宏）支持并不好。其优势主要体现在跳转快速 (HTML 链接点击即跳转)，以及还算方便的 Full search 功能（比如要搜索某个函数指针成员 `wait` 在哪里被调用，可以搜 `"->wait"` 和 `".wait"`）。某种意义上，笔者认为该软件可以认为是本地部署的、可以看不仅仅是内核的软件代码的增强版本 [elixir](https://elixir.bootlin.com/)。

> 其实感觉可以做一个用 Arch Linux 的 makepkg 构建过程中生成 `compile_commands.json` 并且用这个信息来指导源码阅读的工作流，最好信息都可以离线 bake 然后静态的托管到某些网站上。目前我还没发现有这样的工具存在。
> 
> TODO: 调研[静态的 CodeBrowser](https://github.com/KDAB/codebrowser)。

另一个比较有用的准备工作是，把一个软件包的依赖的源码全部下载下来放在一起，统一放到 OpenGrok 里面，这样可以极大加速跨软件包的符号和定义的查找工作。

> 这里我选择 Arch Linux 的 pacman 包作为起点进行依赖查找。
> 
> 值得注意的是，Arch 的包管理模型中有 “虚拟包” 的概念，比如 `opengl-driver` 可以被 depend 和 provide，但是并不对应一个具体的包；这样的依赖很多时候需要人工去 resolve。
> 
> TODO: 等整套工具比较完善之后，写一篇博客介绍如何将系列包的源码全部拉下来。

### 动态跟踪

另一个十分有用的步骤自然是运行时的行为跟踪了。

行为跟踪主要是采用 GDB + debuginfod + (感兴趣的软件包的) `-debug` 软件包。

在没有加载调试符号的情况下，GDB 的 `step` 似乎会直接越过外部函数，这种时候可以考虑 `layout asm` 看汇编，用 `stepi` 进到 call 指令里面去，GDB 此时的 backtrace 会打印出该函数所在地址对应的动态链接库 (当然，应该是从进程地址空间信息 `/proc/<PID>/maps` 反查的)，但具体的函数则不详。动态链接库信息可以用来让你想想到底是什么东西缺符号。

正确配置的 debuginfod 可以完成自动拉取加载的动态链接库的符号的工作，不过要看到源码本身还是需要安装 debug 包。

debug 包的主要获取方法有两种，详情可以参考 [Debugging/Getting traces - ArchWiki](https://wiki.archlinux.org/title/Debugging/Getting_traces)：
1. 特定的 Archlinux mirror
   - https://geo.mirror.pkgbuild.com/
   - 但是个别包似乎会出现 debug 包内源码不全的情况，如 `vulkan-icd-loader`，不清楚具体原因；方法 2 无此问题
2. 自己编译

关于如何编译 debug 包，值得简单记两笔。

打 debug 包需要 

1. 拉 PKGBUILD 
   - 可以考虑用 `asp` 这个工具自动从 GitHub (https 的话需要配合 `proxychains` 科学上网) 上面拉对应的 recipe 
   - [pbget](https://xyne.dev/projects/pbget/) 这个工具不知道是否可以用于自动化的把依赖项目的 recipe 全部拉下来 (?)
     - 我自己测试是不行，不过是用 Python 3 + pyalpm 写的，有一定的研究和修改价值
2. 进行编译
   - [ArchWiki](https://wiki.archlinux.org/title/DeveloperWiki:Building_in_a_clean_chroot) 推荐使用 clean chroot 编译，这样也方便设定单独的 makepkg 的设置 
   - 使用 Wiki 中描述的，方便的方法如下：
     1. 安装 devtools 包 
     2. 更改 chroot 环境内的 makepkg 配置，启用 OPTIONS 中的 debug 和 strip
        - `/usr/share/devtools/makepkg-${arch}.conf` 这里 arch 选择 x86_64
        - (optional) 把并行编译的 -j 也设置好，不过有些构建系统会自动检测并启用并行编译
     4. 在有 PKGBULID 的文件夹下面运行 `extra-x86_64-build`，然后装源码包和二进制包 （pacman -U)
        - 包检查不过去没啥事；两个包都要装上，因为调试符号匹配的时候应该是有一个随机生成的 UUID 来做的
        - 如果想给 makepkg 传参需要加两个 --，比如 `extra-x86_64-build -- -- --skippgpcheck`


在看 elfutils 的时候同时看到了一个工具 `eu-stack`，可以用来截取某个进程当前时刻所有线程的栈信息，并且可以加选项 `-m` 来用 debuginfod 进行符号查找。

感觉在分析 GUI 程序高 CPU 占用的性能分析的场合，`eu-stack` 可以作为一种采样手段使用。

## Vulkan Loader

Vulkan Loader 是垫在各个 Vulkan 驱动和用户程序中间的层，主要用来解决多设备枚举使用的问题。

Vulkan Loader 有默认的 ICD (Installable Client Driver) 的[搜索路径](https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderDriverInterface.md#driver-discovery-on-linux)，向系统中安装的驱动程序会通过在给定的 ICD 路径（可能是文件夹，也可能是 Windows 注册表）中写入信息的方式来向 Vulkan Loader 报告自己的信息。

例如，`/usr/share/vulkan/icd.d/radeon_icd.x86_64.json` 中的信息如下：

```json
{
    "ICD": {
        "api_version": "1.3.230",
        "library_path": "/usr/lib/libvulkan_radeon.so"
    },
    "file_format_version": "1.0.0"
}
```

可以看到，核心的信息是 `library_path`。(Ref: [LoaderDriverInterface.md @ Vulkan-Loader](https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderDriverInterface.md#driver-manifest-file-format))

另一种传入 ICD 信息的方法是 `VK_DRIVER_FILES` 环境变量（[不过在 root 权限下无效](https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderInterfaceArchitecture.md#elevated-privilege-caveats)），可以通过指定这个变量的方式，强制 Vulkan Loader 只考虑某些路径。

比如 `VK_DRIVER_FILES=/usr/share/vulkan/icd.d/radeon_icd.x86_64.json vulkaninfo` 可以只启用 mesa radv 实现。

每个驱动要实现 `vk_icdGetInstanceProcAddr` 这个调用，和 (>= Version 4) `vk_icdGetPhysicalDeviceProcAddr` 这个调用：
```c
typedef void (VKAPI_PTR *PFN_vkVoidFunction)(void);

// 全局的调用，如 vkCreateInstance，会把第一个参数置为空
// 先用这个调用拿到 `vkGetDeviceProcAddr`，再进行 device level 的调用
VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL vk_icdGetInstanceProcAddr(
   VkInstance instance,
   const char* pName
);

// 主要用于 VkPhysicalDevice 为第一个参数的 Vulkan API 派发
// - 否则 Vulkan Loader 会认为这个命令是 logical device command，
//   从而尝试传入 VkDevice 对象 
// 典型用途是一些 loader 不知道的物理设备扩展
// (>= Version 7) 这个接口需要可以从 vk_icdGetInstanceProcAddr 获得
PFN_vkVoidFunction vk_icdGetPhysicalDeviceProcAddr(
   VkInstance instance,
   const char* pName
);
```

有些厂商会在同一个库里面实现几套 API 的用户态实现 (e.g. `nvidia_icd.json` 中的 `libGLX_nvidia.so.0`)，但驱动程序不能把 Vulkan 官方的函数名占用掉。

动态链接到 Vulkan Loader 的**用户程序**是通过系统例程 (`dlsym` 或者 `GetProcAddress`) 获得 `vkGetInstanceProcAddr` 和 `vkGetDeviceProcAddr` 两个函数的地址并且调用的方式来枚举其它 Vulkan API 调用的函数地址的。

```c
PFN_vkVoidFunction (VKAPI_PTR *PFN_vkGetInstanceProcAddr)(VkInstance instance, const char* pName)
PFN_vkVoidFunction (VKAPI_PTR *PFN_vkGetDeviceProcAddr)(VkDevice device, const char* pName)
```

Loader 的 `vkGetInstanceProcAddr` 的行为在[官方文档](https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderDriverInterface.md#driver-unknown-physical-device-extensions)中有记录。

简单来说，就是用 `vk_icdGetInstanceProcAddr` 一路往下找，找到的会记录在跳转表中，之后在 terminator 那边可以直接跳转过去，不用再获取。

https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderDriverInterface.md#driver-dispatchable-object-creation

https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderDriverInterface.md#handling-khr-surface-objects-in-wsi-extensions