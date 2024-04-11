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
    - 帧缓冲设备 /dev/fbX
- 绘制到屏幕 (独占)：近代
  - kms & drm
  - glXX, Vulkan
- 窗口混成
  - X11, wayland
  - xdg
- 窗口系统
  - kde, gnome
  - dbus
