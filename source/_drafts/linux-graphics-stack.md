---
title: Linux 图形栈之旅
date: 2024-04-10
---

本文将力图自顶向下的说明白，GUI 程序是如何绘制到 Linux 桌面上的。

大纲：
- GUI 程序的基本构成
  - CLI 程序的事件循环机制
  - GUI 程序的事件循环机制
  - 基本组成部分
    - User input (Keyboard, mouse)
      - Advanced topic: IME
      - Advanced topic: notifications
    - 绘制到屏幕 (独占)
    - 窗口混成器
- 绘制到屏幕 (独占)：远古时期
  - Date back to 远古时期，8086 只需要字符终端！
    - e.g. Amstrad PPC512
  - CGA adapter / VGA adapter
  - 屏幕：看起来很大的 RGB 缓冲
    - 最早采用调色板来做，后来 true color
  - VGA / VESA
    - "Video ROM"
    - Advanced topic: UEFI GOP
  - 内核接口

- 独占屏幕绘制
  - 帧缓冲设备 /dev/fbX (`drivers/video/fbdev`)
    - vesafb
    - uvesafb
      > uvesafb is an enhanced version of vesafb.  It uses a userspace helper (v86d)
        to execute calls to the x86 Video BIOS functions.  The driver is not limited
        to any specific arch and whether it works on a given arch or not depends on
        that arch being supported by the userspace daemon.  It has been tested on
        x86_32 and x86_64.
      > 
      > A single BIOS call is represented by an instance of the uvesafb_ktask
        structure.  This structure contains a buffer, a completion struct and a
        uvesafb_task substructure, containing the values of the x86 registers, a flags
        field and a field indicating the length of the buffer.  Whenever a BIOS call
        is made in the driver, uvesafb_exec() builds a message using the uvesafb_task
        substructure and the contents of the buffer.  This message is then assigned a
        random ack number and sent to the userspace daemon using the connector
        interface.
      
    - efifb
  - kms & drm
  - glXX, Vulkan
- 窗口混成
  - X11, wayland
  - xdg
- 窗口系统
  - kde, gnome
  - dbus

> Linux 图形堆栈初探
> 
> 你是否对多姿多彩的图形界面程序心生好奇，却因对其复杂度望而却步？本次小聚，刘紫檀同学将“抛砖引玉”，简要介绍 GUI 程序在 Linux 图形用户界面程序显示的基本技术，主题涵盖驱动 GPU 的 Framebuffer，DRM / KMS 等接口，窗口混成器，输入设备和事件处理等内容。同时，小聚还将介绍阅读 Linux 内核和驱动代码的一些经验。

## 开始之前

本文的形成使用了以下的材料：
- [HiGFXback](https://higfxback.github.io/) 一个展示 Linux 图形显示系统后端的历史的 LFS 发行版
- 输入子系统
  - [Linux驱动：输入子系统 分析 - schips - 博客园](https://www.cnblogs.com/schips/p/linux_input_subsystem.html)
  - [Linux Input Subsystem userspace API](https://kernel.org/doc/html/latest/input/input_uapi.html)
  - [Linux Input Subsystem kernel API](https://kernel.org/doc/html/latest/input/input_kapi.html)
- Console 子系统
  - https://www.kernel.org/doc/Documentation/console/console.txt
- 图形栈介绍
  - [An introduction to the Linux graphics stack](https://flusp.ime.usp.br/blogs,/kernel-graphics/an_introduction_to_the_linux_graphics_stack/)
  - [A brief introduction to the Linux graphics stack - Igalia Blogs](https://blogs.igalia.com/itoral/2014/07/29/a-brief-introduction-to-the-linux-graphics-stack/)
  - The Linux graphics stack in a nutshell - [Part 1](https://lwn.net/Articles/955376/), [Part 2](https://lwn.net/Articles/955708/)
- X11
  - How X Window Managers Work, And How To Write One [(Part I)](https://jichu4n.com/posts/how-x-window-managers-work-and-how-to-write-one-part-i/), [(Part II)](https://jichu4n.com/posts/how-x-window-managers-work-and-how-to-write-one-part-ii/), [(Part III)](https://jichu4n.com/posts/how-x-window-managers-work-and-how-to-write-one-part-iii/)

在此向他们表示感谢。

## GUI 程序的基本构成

首先，我们可以回忆一下，一个交互式的命令行用户界面程序的基本实现：

```python
while should_not_close:
  cmd = wait_for_new_cmd()
  match cmd:
    case 'cmdA':
      do_cmdA()
    # ... skip some lines
    case 'exit':
      should_not_close = False
```

类似的，GUI 程序的基本构成也很简单：

```python
while should_not_close:
  # 清空输入事件队列
  user_input = wait_for_input()
  # 根据事件队列进行调度
  dispatch_action_for_given_input(user_input)
  # 更新画面内容
  update_frame_according_to_user_input()
```

只不过，这里的输入变成了键盘、鼠标的事件输入，画面变成了可能需要合成和处理的、低层次（像素）或者高层次（UI 控件、窗口）的描述。同时，为了保证画面的响应速度，让交互体验变得流畅起来，这里还涉及到正确的**异步**和**同步**设计。

例如，一个考虑 GUI 本身动态更新的程序可能需要将用户是否输入事件和画面是否更新进行解耦，从而产生如下的结构：

```python
while should_not_close:
  user_inputs = drain_input_queue_nonblocking()
  dispatch_action_for_given_input(user_inputs)
  update_frame_according_to_user_input()
  # *等待下一帧开始*
  wait_for_next_frame()
```

那么，**下一帧应该何时开始**？这涉及到显示系统的基本设计、交换链 (Swapchain)、甚至窗口混成。我们将在后面的部分讨论这个问题。

> TODO: add imm mode UI (e.g. ImGui)

再例如，很多游戏的事件结算拥有相对固定的速率，而渲染速率会因为画面内容不同而产生不同的渲染时间。这样一来，程序可能需要成为如下的结构：

```python
def event_thread():
  while should_not_close:
    user_inputs = drain_input_queue_nonblocking()
    with world_state_lock.lock():
      # 更新世界状态
      world_state = compute_next_world_state(user_inputs, world_state)
    wait_for_next_event_frame()

def render_thread():
  while should_not_close:
    with world_state_lock.lock():
      # 根据世界状态生成下一帧画面
      render_frame_according_to_world_state(world_state)
    wait_for_next_render_frame()
```

本文的主题是 Linux 图形栈的底层实现。故而，本文不会对 Qt、GTK 等图形程序函数库进行过多讨论，而是主要探究这些函数库的“底层接口”，即显示、用户输入等功能在 Linux 上的实现方式。

### 输入事件

输入事件的处理，大多数时候归结为获取鼠标、键盘等输入设备的信息。

Linux 的输入子系统会创建一系列的输入设备节点，这些节点通常位于 `/dev/input/event*`。

子系统内部会维护一个设备的当前状态，用户程序可以通过 EVIOCG* ioctls 来主动请求状态，也可以通过读文件的方式来监听事件更改。`/sys/class/input/event*/device/capabilities/` 中可以请求设备可能的事件类型，`/sys/class/input/event*/device/properties` 中可以请求其属性。

对输入设备事件的监听可以使用 `EVIOCGRAB` ioctl 来切换独占状态。独占状态 (“grab”) 下设备事件只会传输到该监听，参考 [input_grab_device](https://elixir.bootlin.com/linux/v6.8.5/C/ident/input_grab_device)。

[evtest](https://cgit.freedesktop.org/evtest/) 是测试输入设备及其事件的绝佳例程。

> 利用非阻塞的 read 调用可以自然的实现事件队列的查询和清空。

## 独占屏幕绘制

### Framebuffer 设备

Framebuffer 设备 (fbdev) 是提供到图形设备访问的一种 Linux **字符设备**。

> Recall: 字符设备 VS 块设备
> - 字符设备：不支持 seek，read / write 只能顺序
> - 块设备：支持 seek

简单的操作如下：
```c
// 打开设备
int fd = open("/dev/fb0", O_RDWR);

// 映射 framebuffer 到进程内存空间并开始读写
char *fbp = mmap(0, screensize, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
fbp[location] = some_color; // begin writing
```

在看到有设备文件的情况下，应该如何查询是哪个设备驱动提供的呢？可以用 `udevadm`、`/proc/fb` 或者 `/sys/class/graphics/fb*` 查看：

```bash
udevadm info --query=all --name=/dev/fb0
# or
cat /proc/fb
```

同时，Framebuffer 接口提供了基本的显示模式设置支持。所谓显示模式设置，即设置输出的分辨率、色深等信息。该过程又被称为 `modeset` 或者 `modesetting`。`fb_var_screeninfo` 中包含了相关信息。

> NOTE：一些信息在直接 scanout 的驱动中有效，但是在 drm_fb_helper 维护的 DRM 到 Framebuffer 驱动中为无效的值。

```c
// 获取信息
struct fb_fix_screeninfo finfo;
struct fb_var_screeninfo vinfo;
ioctl(fd, FBIOGET_FSCREENINFO, &finfo); 
ioctl(fd, FBIOGET_VSCREENINFO, &vinfo);

// 更改信息 - 进行 modeset 操作
ioctl(fd, FBIOPUT_VSCREENINFO, &vinfo);
```

可以在 `/sys/class/graphics/fb0/modes` 中查看支持的模式。

Framebuffer 设备的通用实现如下：
- vesafb: VESA framebuffer
- efifb: EFI framebuffer；采用 UEFI GOP 来获得显存的基地址。

> 启动时获得的 screen_info 是重要的参考来源。

除此之外，许多 DRM 显示驱动也会通过 drm_fb_helper 中定义的函数来实现 Framebuffer 驱动，以实现兼容。

Linux 绘制到屏幕上的控制台是由一系列 console driver 实现的，console driver 会通过 `struct consw` 来暴露相应的能力，其中包括 fbcon 和 vgacon。fbcon 会采用 Framebuffer 设备来显示到屏幕上。通过 sysfs 可以查看相应的 console driver 的类型。

```bash
$ cat /sys/class/vtconsole/vtcon1/name
(M) frame buffer device
```

### 窗口系统

窗口系统旨在解决的基本问题是，不同应用程序均需要在同一显示器显示，那应该如何组织他们之间的相互关系？



### DRM

Framebuffer 设备很好的抽象了 90 年代的“显示适配器”所需的功能。当时的显示适配器基本遵循 1 适配器 - VGA 接口 - 1 显示器的模式，且没有除了显示画面之外的其它功能。

然而，随着技术进步，显示适配器逐渐增加了 2D 和 3D 显示加速功能，成为了图形处理器 GPU。

#### drm backed framebuffer

> simpledrmdrmfb

```
[    3.168314] i915 0000:00:02.0: [drm] fb0: i915drmfb frame buffer device
```


### Linux common

container_of, etc

- request_mem_region
  - request_mem_region tells the kernel that your driver is going to use this range of I/O addresses, which will prevent other drivers to make any overlapping call to the same region through request_mem_region. This mechanism does not do any kind of mapping, it's a pure reservation mechanism, which relies on the fact that all kernel device drivers must be nice, and they must call request_mem_region, check the return value, and behave properly in case of error.
  - So it is completely logical that your code works without request_mem_region, it's just that it doesn't comply with the kernel coding rules.
- ioremap
  
new API: devm https://subscription.packtpub.com/book/cloud-and-networking/9781801079518/4/ch04lvl1sec86/the-newer-breed-the-devm-managed-apis

> https://wiki.gentoo.org/wiki/Waypipe
>
> https://blog.csdn.net/qq_36310253/article/details/103530442
>
> https://softwareengineering.stackexchange.com/a/88055