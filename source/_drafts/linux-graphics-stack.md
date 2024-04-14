---
title: Linux 图形堆栈之旅
date: 2024-04-10
---

本文将力图自顶向下的说明白，GUI 程序是如何绘制到 Linux 桌面上的。

Intended topics:
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

> 本次小聚将简要介绍 GUI 程序在 Linux 图形用户界面程序显示的基本技术，涵盖 Framebuffer，DRM / KMS，窗口混成器等内容。同时，小聚还将介绍阅读 Linux 内核代码的相关经验。

## 开始之前

本文的形成使用了以下的材料：
- [HiGFXback](https://higfxback.github.io/) 一个展示 Linux 图形显示系统后端的历史的 LFS 发行版

## 独占屏幕绘制

### Framebuffer 设备

Framebuffer，即“帧缓冲”，提供了一种简单的抽象 - 映射显存，开始读写！

Framebuffer 设备以文件形式提供，如 `/dev/fb0`。

- 打开

  `int fd = open("/dev/fb0", O_RDWR);`
- 获取信息

  ```c
  struct fb_fix_screeninfo finfo;
  struct fb_var_screeninfo vinfo;
  ioctl(fd, FBIOGET_FSCREENINFO, &finfo); 
  ioctl(fd, FBIOGET_VSCREENINFO, &vinfo);
  ```

- 更改信息
  
  `ioctl(fd, FBIOPUT_VSCREENINFO, &vinfo);`

- 映射 framebuffer 到进程内存空间并开始读写
  
  ```c
  char *fbp = mmap(0, screensize, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  fbp[location] = some_color; // begin writing
  ```

下面我们来看看主要的实现：
- vesafb: VESA framebuffer
- efifb: EFI framebuffer

在看到有设备文件的情况下，应该如何查询是哪个设备驱动提供的呢？可以用 udevadm 查看：

```bash
udevadm info --query=all --name=/dev/fb0
```

#### vesafb

首先，vesafb 的成功启用需要启动时设置的 `screen_info` 结构中的 `orig_video_isVGA` 为 VESA linear framebuffer

```c
// drivers/video/fbdev/vesafb.c
// static int vesafb_probe(struct platform_device *dev) {
// ...
  if (screen_info.orig_video_isVGA != VIDEO_TYPE_VLFB)
  	return -ENODEV;
// }
```

`screen_info` (/usr/include/linux/screen_info.h) 是 Linux 各个架构公用的一个表示启动时屏幕状态的结构体。在 x86 平台上，

#### efifb

```
fb0: EFI VGA frame buffer device
```

### DRM

#### drm backed framebuffer

> simpledrmdrmfb

```
[    3.168314] i915 0000:00:02.0: [drm] fb0: i915drmfb frame buffer device
```