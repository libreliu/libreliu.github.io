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

## 驱动切换

> https://wiki.archlinux.org/title/Vulkan

```bash
# This assumes the amdgpu number be 0

# amdvlk
VK_ICD_FILENAMES="/usr/share/vulkan/icd.d/amd_icd32.json:/usr/share/vulkan/icd.d/amd_icd64.json" vkcube --gpu_number 0

# radv
VK_ICD_FILENAMES="/usr/share/vulkan/icd.d/radeon_icd.i686.json:/usr/share/vulkan/icd.d/radeon_icd.x86_64.json" vkcube --gpu_number 0
```

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
    - 根据 user 传过来的 syncobj handle ids 查找到相应的 syncobj 对象
  - drm_syncobj_array_wait
    - drm_timeout_abs_to_jiffies: 将 nsec 转换为 scheduler jiffies
      > Jiffy 是 system tick, 用 CONFIG_HZ 来调节
    - drm_syncobj_array_wait_timeout
      - 中心思想是用 syncobj 里面的 dma_fence 的 callback 来叫醒这个进程，然后返回
      - 但是 dma_fence 如果已经 signal 的话，注册的 callback 就都会失效了 (i.e. 不能再注册新的 callback)
        - 所以要处理这个边界情况；这个 dma_fence 的特性是 by design 的，参考 `struct dma_fence` (include/linux/dma-fence.h) 里面的 union 的相关注释 (cb_list -> timestamp -> rcu)
      - 用 schedule_timeout 调度出去，回调里面用 wake_up_process 叫醒自己
  - drm_syncobj_array_free
    - 给各个 syncobj 对象做 put 操作 (syncobj 是 kref 做引用计数的)

### Submit

vk::entry::vkQueueSubmit (xgl/icd/api/vk_queue.cpp)
- vk::Queue::Submit (xgl/icd/api/vk_queue.cpp)
  - 如果提交多个 SubmitInfo (note: 每一个 submit 可以提交多个 command buffer, submit 可以指定 signal/wait semaphore), 则要进行拼接
    - 对于 TMZ (Trusted Memory Zone) 和非 TMZ 提交，需要独立的 queue，以及在 queue 之间进行等待
  - 提交单个 SubmitInfo 的流程
    - vk::Fence::SetActiveDevice
    - vk::Fence::PalFence 来获得 Pal::IFence
    - (Interface) Pal::IQueue::Submit
    - Pal::Queue::Submit (pal/src/core/queue.h) with this = Pal::Amdgpu::Queue
      - Pal::Queue::SubmitInternal (pal/src/core/queue.cpp)
        - Pal::Queue::SubmitConfig
        - (Interface) Pal::ICmdBuffer::PreSubmit
          - Pal::CmdBuffer::Submit (does nothing)
        - Pal::Queue::ValidateSubmit
        - Pal::QueueSubmit::PreProcessSubmit
        - 如果启动 Command Dump：Pal::Queue::OpenCommandDumpFile && Pal::Queue::DumpCmdBuffers
        - 进行提交
          - 可以进行 batching，先聚合在一起 (TODO: find code path)
          - 或者直接进行提交
            - Pal::Amdgpu::Queue::OsSubmit
              - Pal::Amdgpu::Queue::SubmitPm4
                - Pal::Amdgpu::Queue::SubmitIbs
                  - 如果支持 raw2submit (amdgpu_cs_submit_raw2), 则用 raw2 submit
                    - 会准备然后传 bo_list_handle
                    - 会传一个 pFences = pContext->LastTimestampPtr(); 
                      > Returns a pointer to the last timestamp so that the caller can update it
                      - (libdrm) amdgpu_cs_submit_raw2
                        - (libdrm) drmCommandWriteRead with `DRM_AMDGPU_CS`
                  - 否则用 amdgpu_cs_submit
                    - 会传一个 pFences = pContext->LastTimestampPtr(); 
                      > Returns a pointer to the last timestamp so that the caller can update it
                      - 其实到了 libdrm 也是先进行差不多的包装，然后 call 的 amdgpu_cs_submit_raw2
              - 更新 fence: Pal::Queue::DoAssociateFenceWithLastSubmit
                - SyncObj fence: 
                  ```c++
                  result = m_device.ConveySyncObjectState(
                              static_cast<SyncobjFence*>(pFence)->SyncObjHandle(),
                              0,
                              static_cast<SubmissionContext*>(m_pSubmissionContext)->GetLastSignaledSyncObj(),
                              0);
                  ```
                  - 用 amdgpu_cs_syncobj_transfer 或者 amdgpu_cs_syncobj_export_sync_file + amdgpu_cs_syncobj_import_sync_file
                - Legacy fence: `static_cast<Amdgpu::TimestampFence*>(pFence)->AssociateWithLastTimestamp();`
                  - `AtomicExchange64(&m_timestamp, m_pContext->LastTimestamp());`

Kernel 中
- `DRM_IOCTL_DEF_DRV(AMDGPU_CS, amdgpu_cs_ioctl, DRM_AUTH|DRM_RENDER_ALLOW),`
  - amdgpu_cs_ioctl

中断注册
1. amdgpu_irq_init: 总中断请求派发函数注册
  ```c
  /* PCI devices require shared interrupts. */
  r = request_irq(irq, amdgpu_irq_handler, IRQF_SHARED, adev_to_drm(adev)->driver->name,
  		adev_to_drm(adev));
  ```
2. per domain 注册
  - e.g. `gfx_v10_0_set_irq_funcs` 给 `adev->gfx.eop_irq` 里面添上了 `` 这个处理函数
  - 然后 amdgpu_irq_add_id 来注册到 `adev->irq.client[client_id].sources`

中断来临时 signal fence
- amdgpu_irq_handler
  - amdgpu_ih_process: walk the IH ring
    - amdgpu_irq_dispatch
      - 根据来源 ID 派发到 process 函数
        e.g. gfx_v10_0_eop_irq for cp eop
        - amdgpu_fence_process
          - dma_fence_signal

IQueue 机制
- pal/src/core/layers/decorators.cpp

> https://github.com/mikesart/gpuvis/wiki/TechDocs-AMDGpu
