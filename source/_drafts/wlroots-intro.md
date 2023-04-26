---
title: wlroots 源码分析其一：总览
date: 2023-01-06
---

## Recap: libwayland

Wayland 的核心和 X 窗口系统类似，是一组协议——不过甩掉了 X 的历史包袱，设计上更为清爽和先进。

Wayland 协议本身是 C/S 架构的，混成器 (compositor) 作为服务端，各个图形程序作为客户端，通过 Wayland 协议在 Unix Domain Socket 上工作。

> 传输 bulk data 需要用 shared memory 或者 dmabuf，不过除此之外的其它消息放到 TCP 等等也没有什么所谓。

libwayland 提供了对 Wayland 协议的抽象（让你不用关心怎么构造协议包），并且以一种 RPC 的风格封装了各种资源、资源 proxy 和对应的操作。

关于 libwayland (& Wayland 协议) 的相关内容可以参考 [Wayland Book](https://wayland-book.com/) 和 Sway 前开发者的博客文章 [An introduction to Wayland](https://drewdevault.com/2017/06/10/Introduction-to-Wayland.html)，**推荐先阅读后者**，前者作为协议部分的参考。后者中比较详细的介绍了一个 client 和 server 利用 libwayland 关于资源管理的操作的简要流程。

关于 Wayland 协议和 libwayland 库所提供设施的参考，可以查阅 [The Wayland Protocol](https://wayland.freedesktop.org/docs/html/) 站点。

> 一个示例 Wayland 客户端:
> [hello-wayland](https://github.com/emersion/hello-wayland)

<!--
wayland protocal and programming & egl stuff
https://blog.csdn.net/u012839187/article/details/97135985
display: mesa: eglapi接口:getdisplay&initialize: https://blog.csdn.net/u012839187/article/details/120797488
-->

## wlroots

[wlroots](https://gitlab.freedesktop.org/wlroots/wlroots) 是很多原生 Wayland 混成器所使用的框架库 (e.g. [Sway](https://swaywm.org/))，其本身的设计目标是成为一个模块化的 Wayland 混成器框架，用来降低新的混成器的开发难度。

wlroots 本身提供一个参考实现 tinywl，可以在数千行代码内实现一个简单的 Wayland 混成器。

同时，Sway 和 wlroots 的前开发者 Drew DeVault 的博客也值得参考，不过部分信息有些过时：
- https://drewdevault.com/2017/12/28/wlroots-whitepaper-available.html 
- https://drewdevault.com/2018/02/17/Writing-a-Wayland-compositor-1.html 
- https://drewdevault.com/2018/02/22/Writing-a-wayland-compositor-part-2.html 
- https://drewdevault.com/2018/02/28/Writing-a-wayland-compositor-part-3.html 
- https://drewdevault.com/2018/07/29/Wayland-shells.html 
- https://drewdevault.com/2018/07/17/Input-handling-in-wlroots.html 

> 知乎的中文翻译文章 (部分):
> - [【译】从零开始的 Wayland 合成器 —— 1. Hello wlroots](https://zhuanlan.zhihu.com/p/411213507)
> - [【译】从零开始的 Wayland 合成器 —— 2. 装配服务器](https://zhuanlan.zhihu.com/p/412289576)
> - [【译】从零开始的 Wayland 合成器 —— 3. 渲染一个窗口](https://zhuanlan.zhihu.com/p/412289780)

本文的分析基于 2022 年 12 月 21 日的 master 分支，commit 869af1c。

### 说明

首先应该注意，`wl_` 开头的符号是 libwayland 的符号，其负责提供 server-client 按 protocol 的通信、通用的信号机制和事件循环。

`wlr_` 开头的符号则是由 wlroots 实现并提供的。

#### 测试

```
cd wlroots/tinywl
sudo modprobe vkms
udevadm settle
export WLR_BACKENDS=drm
export WLR_RENDERER=pixman
export WLR_DRM_DEVICES=/dev/dri/by-path/platform-vkms-card
sudo chmod ugo+rw /dev/dri/by-path/platform-vkms-card
sudo -E seatd-launch -- ./tinywl -s 'kill $PPID' || [ $? = 143 ]
```

> Note: NVIDIA 的专有驱动的 Kernel Mode Setting 功能默认关闭，需要在内核启动参数中增加 `nvidia_drm.modeset=1` 来开启
>
> - 鉴于 N 家会自己提供 Xorg DDX 部分的动态链接库，开不开 KMS 对 X 支持没什么影响，但是绝大多数其它的混成器都依赖 KMS 来处理 Display 相关的内容
> 
> backend/session/session.c:383 中会通过 `drmIsKMS` 来筛选掉不支持 KMS 的 drm 设备节点

### `wlr_backend`

实现下面的接口
```c
struct wlr_backend_impl {
	bool (*start)(struct wlr_backend *backend);
	void (*destroy)(struct wlr_backend *backend);
	clockid_t (*get_presentation_clock)(struct wlr_backend *backend);
	int (*get_drm_fd)(struct wlr_backend *backend);
	uint32_t (*get_buffer_caps)(struct wlr_backend *backend);
};
```

共有如下的 backend:
- `backend/drm`
- `backend/headless`
- `backend/libinput`
- `backend/multi`
- `backend/wayland`
- `backend/x11`

其中，根据 [wlroots 白皮书](https://drewdevault.com/2017/12/28/wlroots-whitepaper-available.html)，**multi** 这个 backend 的设计目标是作为一个 virtual backend，在运行时可以添加删除 underlying backend，将多个 backend 的功能搓到一起。

wlr_backend_start
- backend->impl->start

### `wlr_renderer`

实现下面的接口
```c
struct wlr_renderer_impl {
	bool (*bind_buffer)(struct wlr_renderer *renderer,
		struct wlr_buffer *buffer);
	bool (*begin)(struct wlr_renderer *renderer, uint32_t width,
		uint32_t height);
	void (*end)(struct wlr_renderer *renderer);
	void (*clear)(struct wlr_renderer *renderer, const float color[static 4]);
	void (*scissor)(struct wlr_renderer *renderer, struct wlr_box *box);
	bool (*render_subtexture_with_matrix)(struct wlr_renderer *renderer,
		struct wlr_texture *texture, const struct wlr_fbox *box,
		const float matrix[static 9], float alpha);
	void (*render_quad_with_matrix)(struct wlr_renderer *renderer,
		const float color[static 4], const float matrix[static 9]);
	const uint32_t *(*get_shm_texture_formats)(
		struct wlr_renderer *renderer, size_t *len);
	const struct wlr_drm_format_set *(*get_dmabuf_texture_formats)(
		struct wlr_renderer *renderer);
	const struct wlr_drm_format_set *(*get_render_formats)(
		struct wlr_renderer *renderer);
	uint32_t (*preferred_read_format)(struct wlr_renderer *renderer);
	bool (*read_pixels)(struct wlr_renderer *renderer, uint32_t fmt,
		uint32_t stride, uint32_t width, uint32_t height,
		uint32_t src_x, uint32_t src_y, uint32_t dst_x, uint32_t dst_y,
		void *data);
	void (*destroy)(struct wlr_renderer *renderer);
	int (*get_drm_fd)(struct wlr_renderer *renderer);
	uint32_t (*get_render_buffer_caps)(struct wlr_renderer *renderer);
	struct wlr_texture *(*texture_from_buffer)(struct wlr_renderer *renderer,
		struct wlr_buffer *buffer);
};
```

共有如下的 renderer:
- gles2
- pixman
- vulkan

### wlr_compositor

