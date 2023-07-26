---
title: amdvlk 源码阅读：同步机制
date: 2023-07-26
---

> 使用
> - amdvlk 2023.Q2.3
> - libdrm 2.4.114
> - linux master (~v6.5-rc3, commit 9e0ee0c7)
>
> NOTE on amdvlk: ArchLinux 用户可以下载 amdvlk 包的 PKGBUILD，然后 `makepkg --nobuild --skippgpcheck` 来比较方便的把 `xgl`, `gpurt`, `llpc`, `pal` 和两个 third-party 仓库的内容拉下来。

## Fence

### 创建

- vk::entry::vkCreateFence (xgl/icd/api/vk_device.cpp)
  - vk::Device::CreateFence (xgl/icd/api/vk_device.cpp)
    - vk::Fence::Create (xgl/icd/api/vk_fence.cpp)
      - (Interface) Pal::IDevice::CreateFence (pal/inc/core/palDevice.h)
        - Pal::Amdgpu::Device::CreateFence (pal/src/core/os/amdgpu/amdgpuDevice.cpp)
          - 根据 m_fenceType 决定构造 Pal::Amdgpu::SyncobjFence 还是 Pal::Amdgpu::TimestampFence
        - 调用相应 Fence 的 Init


### Synchronization Object

Pal::Amdgpu::SyncobjFence::Init (pal/src/core/os/amdgpu/amdgpuSyncobjFence.cpp):
- Pal::Amdgpu::Device::CreateSyncObject (pal/src/core/os/amdgpu/amdgpuDevice.cpp)
  - 如果 libdrm-amdgpu 有 `amdgpu_cs_create_syncobj2` 函数，则使用 SyncObj2
    - 相应的加载逻辑在 Pal::AMdgpu::DrmLoader::Init (pal/src/core/os/amdgpu/g_drmLoader.cpp)
  - 如果 libdrm-amdgpu 有 `amdgpu_cs_create_syncobj` 函数，则使用 SyncObj

在 libdrm-2.4.114 中，其会调用 `drmSyncobjCreate`，然后 `drmIoctl(fd, DRM_IOCTL_SYNCOBJ_CREATE, &args)` 进内核.

进内核后，sync obj 长这样：

```c
/**
 * struct drm_syncobj - sync object.
 *
 * This structure defines a generic sync object which wraps a &dma_fence.
 */
struct drm_syncobj {
	/**
	 * @refcount: Reference count of this object.
	 */
	struct kref refcount;
	/**
	 * @fence:
	 * NULL or a pointer to the fence bound to this object.
	 *
	 * This field should not be used directly. Use drm_syncobj_fence_get()
	 * and drm_syncobj_replace_fence() instead.
	 */
	struct dma_fence __rcu *fence;
	/**
	 * @cb_list: List of callbacks to call when the &fence gets replaced.
	 */
	struct list_head cb_list;
	/**
	 * @lock: Protects &cb_list and write-locks &fence.
	 */
	spinlock_t lock;
	/**
	 * @file: A file backing for this syncobj.
	 */
	struct file *file;
};
```
- DRM_IOCTL_DEF(DRM_IOCTL_SYNCOBJ_CREATE, drm_syncobj_create_ioctl, DRM_RENDER_ALLOW) (drivers/gpu/drm/drm_ioctl.c)
- drm_syncobj_create_ioctl (drivers/gpu/drm/drm_syncobj.c)
  - drm_syncobj_create_as_handle
    - drm_syncobj_create
      - 初始化成员
      - 如果创建时就是 signaled，则 `drm_syncobj_assign_null_handle`
      - fence: if non-NULL, the syncobj will represent this fence
    - drm_syncobj_get_handle
      - 将 drm_syncobj 的 handle 放到 idr 里面去（一个内核里面类似 std::map 的设施）
      - 返回 handle ID (也就是其在 idr 中的 id)

### Wait

- vk::entry::vkWaitForFences (vk_device.cpp)
  - vk::Device::WaitForFences (vk_device.cpp)
    - Pal::IDevice::WaitForFences (palDevice.h)
	  - Pal::Device::WaitForFences (device.cpp)
	  	- Pal::Amdgpu::SyncobjFence::WaitForFences (amdgpuSyncobjFence.cpp)
		  > ```c
		  > //fix even if the syncobj's submit is still in m_batchedCmds.
		  > flags |= DRM_SYNCOBJ_WAIT_FLAGS_WAIT_FOR_SUBMIT;
		  > ```
		  - 调用 libdrm 的 `amdgpu_cs_syncobj_wait`
		  	- `drmSyncobjWait`
			  - 然后 `ret = drmIoctl(fd, DRM_IOCTL_SYNCOBJ_WAIT, &args)`


- drm_syncobj_wait_ioctl (drivers/gpu/drm/drm_syncobj.c)
  - drm_syncobj_array_find
  - drm_syncobj_array_wait
  - drm_syncobj_array_free