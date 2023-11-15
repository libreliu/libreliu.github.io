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
        - `static_cast<Fence*>(submitInfo.ppFences[idx])->AssociateWithContext(m_pSubmissionContext);`
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
    - amdgpu_cs_parser_init
      - 根据 cs->in.ctx_id 拿到 amdgpu ctx
        (这个 ctx id 是 userspace drm driver 之前走 TODO 拿到的)
      - 初始化 amdgpu_sync
        - DECLARE_HASHTABLE(fences, 4)
          - struct hlist_head fences[1 << (4)]
    - amdgpu_cs_pass1
      - copy user trunks to kernel
      - 初始化好 amdgpu_cs_chunk (p->chunks)
        - 根据具体的 chunk id 选择不同的检查
          1. amdgpu_cs_p1_ib
             - amdgpu_cs_job_idx
               - amdgpu_ctx_get_entity:
                 - 数量检查: `amdgpu_ctx_num_entities[AMDGPU_HW_IP_NUM]`
                 - initialize when nullptr: `amdgpu_ctx_init_entity(ctx, hw_ip, ring);`
                   - `drm_gpu_scheduler **scheds = adev->gpu_sched[hw_ip][hw_prio].sched;`
                     - 如果有 xcp mgr 则用 xcp 来选择 scheds
                       - https://github.com/torvalds/linux/commit/75d1692393cb78b510ff18733457f91d002452f7
                   - drm_sched_entity_init
                     - `entity->rq = &sched_list[0]->sched_rq[entity->priority];`
                     - 初始化 `entity->entity_idle` 这个 completion 对象（相当于内核的信号量，支持 wait 调度出去）
                 - return from `&ctx->entities[hw_ip][ring]->entity`
               - Check if we can add this IB to some existing job
               - If not increase the gang size if possible
               - 这里看出 gang_size 就是 p->entities 的最大个数 (=AMDGPU_CS_GANG_SIZE=4)
                 - 相当于最多同时给四个 entity 交任务 (ib)？
             - 增加 `num_ibs[r]` 并检测其是否超最大 `amdgpu_ring_max_ibs`
             - 将 gang_leader_idx 设置为获得的 job_idx
          2. amdgpu_cs_p1_user_fence
             - drm_gem_object_lookup 拿到 drm_gem_object
               - drm_file->object_idr 里面直接从 handle id 查 drm_gem_object 出来
                 > 看起来 drm gem 是一等公民（挠头
             - `amdgpu_bo *bo = amdgpu_bo_ref(gem_to_amdgpu_bo(gobj));`
             - 拿到 bo 后看一下该 bo 的 size, 如果
               - size != PAGE_SIZE
               - drm_amdgpu_cs_chunk_fence->offset + 8 > PAGE_SIZE
               - `amdgpu_ttm_tt_get_usermm(bo->tbo.ttm)` 失败
               则放弃
             - 否则将 drm_amdgpu_cs_chunk_fence->offset 值拿出来，作为 `uf_offset`
          3. amdgpu_cs_p1_bo_handles
             - `amdgpu_bo_create_list_entry_array(drm_amdgpu_bo_list_in*, drm_amdgpu_bo_list_entry **)`
             - `amdgpu_bo_list_create(p->adev, p->filp, info, data->bo_number, &p->bo_list);`
        - 分配 gang_size 个 amdgpu_job, 存到 `p->jobs[i]`
          - `amdgpu_job_alloc(p->adev, vm, p->entities[i], vm, num_ibs[i], &p->jobs[i])`
            - `(*job)->base.sched = &adev->rings[0]->sched;`
            - `(*job)->vm = vm;`
            - `amdgpu_sync_create(&(*job)->explicit_sync);`
              - hash_init(sync->fences)
            - `drm_sched_job_init(&(*job)->base, entity, owner /* vm */)`
              - `job->s_fence = drm_sched_fence_alloc(entity, owner);` 从 slab 里面分配一个 drm_sched_fence
        - `p->gang_leader = p->jobs[p->gang_leader_idx];`
        - 如果之前有见到 user_fence trunk 的话
          - p->gang_leader->uf_addr = uf_offset
        - amdgpu_vm_set_task_info(vm)
          - 设置一些该 vm 的 gid, pid, process name 等的信息，用当前 syscall 的调用者的进程的信息 (get_task_comm)
    - amdgpu_cs_pass2：再轮询一遍 chunks; 根据 chunk 类型分派
      1. amdgpu_cs_p2_ib(p, chunk, &ce_preempt, &de_preempt)
         - 检查 ce_preempt 和 de_preempt 的数量是否符合要求
         - 用 amdgpu_ib_get 来分配并准备 ib，然后放到 job->ibs[] 里面
           - amdgpu_sa_bo_new 来从 drm suballoc 机制这边拿 ib
           > `amdgpu_cs_p1_ib` 预先数了数 ibs 要几个
         - 维护好 ib 的 gpu_addr, length_dw, flags
      2. amdgpu_cs_p2_dependencies(p, chunk): AMDGPU_CHUNK_ID_SCHEDULED_DEPENDENCIES 和 AMDGPU_CHUNK_ID_DEPENDENCIES 两种可能
         - trunk 数据 `drm_amdgpu_cs_chunk_dep`，里面有 ip_type, ip_instance, ring, ctx_id, handle
         - amdgpu_ctx_get 拿到 dep.ctx_id 对应的 amdgpu_ctx
         - amdgpu_ctx_get_entity 拿到对应的 entity
         - 拿到 entity 对应的 fence `fence = amdgpu_ctx_get_fence(ctx, entity, deps[i].handle)`
           - `fence = dma_fence_get(to_amdgpu_ctx_entity(entity)->fences[seq & (amdgpu_sched_jobs - 1)]);`
             - int amdgpu_sched_jobs = 32 (defined in amdgpu_drv.c)
             - 这里的 seq 是 `deps[i].handle`
         - 对于 AMDGPU_CHUNK_ID_SCHEDULED_DEPENDENCIES
           - fence 用 to_drm_sched_fence(fence)->scheduled 这个替换掉原来的 fence
         - amdgpu_sync_fence(&p->sync, fence)
           - if (amdgpu_sync_add_later(sync, fence)) return 0
             
             即：如果 fence 的 context 和 sync 里面已经有的是同一个，且传入的 fence 比较晚，则将 amdgpu_sync 这个 hashtable 里面 amdgpu_sync_entry 这项的 fence 换成这个比较晚的，并且成功返回
             - 用 dma_fence_is_later 来判断哪个 fence 比较晚
               - 在同一个 context 下，用 dma_fence->seqno 就可以判断哪个比较晚
           - 否则，分配一个 amdgpu_sync_entry 然后把这东西填到 amdgpu_sync 这个 hashtable 里面去
             > Imply 了这个 fence 的 context 是里面没出现过的
      3. amdgpu_cs_p2_syncobj_in(p, chunk) (chunk 类型是 drm_amdgpu_cs_chunk_sem，里面只有一个 handle)
         - `amdgpu_syncobj_lookup_and_add(p, deps[i].handle, 0, 0);`
           - `drm_syncobj_find_fence(p->filp, handle, point, flags, &fence);`
             - fence = drm_syncobj_fence_get(syncobj);
             - ret = dma_fence_chain_find_seqno(fence, point);
               - if null, use a dummy one with dma_fence_get_stub
             - if (!(flags & DRM_SYNCOBJ_WAIT_FLAGS_WAIT_FOR_SUBMIT)) goto out;
             - `(syncobj_wait_entry) wait.task = current;`
             - `wait.point = point;`
             - drm_syncobj_fence_add_wait(syncobj, &wait);
               - 让 wait->fence = syncobj 里面的 fence, if applicable
             - 进行 wait: schedule_timeout(timeout);
             - *fence = wait.fence;
             - if (wait.node.next)
		             drm_syncobj_remove_wait(syncobj, &wait);
           - `amdgpu_sync_fence(&p->sync, fence);`
      4. amdgpu_cs_p2_syncobj_out(p, chunk) (chunk 类型是 drm_amdgpu_cs_chunk_sem，里面只有一个 handle)
         - (如果已经有则 -EINVAL) 分配 `num_deps` 个 `p->post_deps`
           > ```c
           > struct amdgpu_cs_post_dep {
           >   struct drm_syncobj *syncobj;
           >   struct dma_fence_chain *chain;
           >   u64 point;
           > };
           > ```
         - for i in range(num_deps):
           - `p->post_deps[i].syncobj = drm_syncobj_find(p->filp, deps[i].handle);`
             - drm_syncobj_find: idr 来找 file_private->syncobj_idr
           - `p->post_deps[i].chain = NULL;`
           - `p->post_deps[i].point = 0;`
             
      5. amdgpu_cs_p2_syncobj_timeline_wait(p, chunk);
         - `amdgpu_syncobj_lookup_and_add(p, syncobj_deps[i].handle, syncobj_deps[i].point, syncobj_deps[i].flags)`
      6. amdgpu_cs_p2_syncobj_timeline_signal(p, chunk);
         - 类似 `amdgpu_cs_p2_syncobj_out`，不过有 point 和 chain 的信息
           - 如果 point != 0 的话，则 dep->chain = dma_fence_chain_alloc()
           - dep->point = syncobj_deps[i].point
      7. amdgpu_cs_p2_shadow(p, chunk);
         - 略
    - amdgpu_cs_parser_bos
      - bo_list 按 priority 返回一个 validated list
      - 这个 list 里面的 bo 要去 ttm 里面 get user pages
        - `amdgpu_ttm_tt_get_user_pages`: get device accessible pages that back user memory and start HMM tracking CPU page table update'
        - TODO
    - amdgpu_cs_patch_jobs
      - amdgpu_cs_patch_ibs
        - amdgpu_cs_find_mapping(p, va_start, &aobj, &m);
        - amdgpu_bo_kmap(aobj, (void **)&kptr);
        - 根据 ring->funcs->parse_cs 是否存在来决定
          1. r = amdgpu_ring_parse_cs(ring, p, job, ib);
          2. r = amdgpu_ring_patch_cs_in_place(ring, p, job, ib);
        - amdgpu_bo_kunmap(aobj)
    - amdgpu_cs_vm_handling
      - amdgpu_vm_clear_freed(adev, vm, NULL)
      - amdgpu_vm_bo_update(adev, fpriv->prt_va, false);
      - amdgpu_sync_fence(&p->sync, fpriv->prt_va->last_pt_update);
      - 一堆乱七八糟的，大概就是整理页表和挪 buffer
    - amdgpu_cs_sync_rings
      - `r = amdgpu_ctx_wait_prev_fence(p->ctx, p->entities[p->gang_leader_idx]);`
        - struct amdgpu_ctx_entity *centity = to_amdgpu_ctx_entity(entity);
        - idx = centity->sequence & (amdgpu_sched_jobs - 1);
        - other = dma_fence_get(centity->fences[idx]);
        - r = dma_fence_wait(other, true);
      - for each `p->validated`
        - `r = amdgpu_sync_resv(p->adev, &p->sync, resv, sync_mode, &fpriv->vm);`
          > sync to a reservation object
          > 这里的 sync to 就是给 amdgpu_sync 加上要等的 fence
      - for gang size
        - `r = amdgpu_sync_push_to_job(&p->sync, p->jobs[i]);`
      - sched = p->gang_leader->base.entity->rq->sched;
      - 用 amdgpu_sync_get_fence 把 p->sync 里面没有 signal 的 fence 都拿出来，然后
        - 对于共享一个 drm_gpu_scheduler 的 drm_sched_fence
        
          用 `r = amdgpu_sync_fence(&p->gang_leader->explicit_sync, fence);`

          和 `p->gang_leader->explicit_sync` 进行同步
    - trace_amdgpu_cs_ibs
      - `trace_amdgpu_cs(p, job, &job->ibs[j])`
    - amdgpu_cs_submit
      - for gang_size
        - drm_sched_job_arm(&p->jobs[i]->base);
          - 主要是从 job->entity 里面选择合适的 runqueue，根据 runqueue 初始化 sched,和一些其他的job相关的东西，比如 job id count
          - drm_sched_fence_init(job->s_fence, job->entity);
      - for gang_size && 不是 leader 的 job
        - fence = &p->jobs[i]->base.s_fence->scheduled;
        - r = drm_sched_job_add_dependency(&leader->base, fence);
          - 相当于让 leader 的 drm_sched_job 依赖于 fence
      - 如果 gang_size > 1, for gang_size
        - amdgpu_job_set_gang_leader(p->jobs[i], leader);
          - job->gang_submit = &leader->base.s_fence->scheduled;
      - 一些看不懂的关于 ttm userpage 的处理，大概是确保 user pages done？
      - 对于每个 p->validated 的 bo
        - 对于非 leader 的 job
          - dma_resv_add_fence(e->tv.bo->base.resv, &p->jobs[i]->base.s_fence->finished, DMA_RESV_USAGE_READ);
      - `seq = amdgpu_ctx_add_fence(p->ctx, p->entities[p->gang_leader_idx], p->fence);`
        - ctx 的fence 这块就是一个 ring，现在放到 seq & (amdgpu_scned_jobs - 1) 这里
        - `centity->fences[idx] = fence; centity->sequence++;`
        - 维护已经使用掉的 fence (相同槽位的other) 的时间 
          `atomic64_add(ktime_to_ns(amdgpu_ctx_fence_time(other)), &ctx->mgr->time_spend[centity->hw_ip]);`
      - amdgpu_cs_post_dependencies(p);
        - 主要是处理 p->post_deps 里面的内容
          - 如果 chain && point
            `drm_syncobj_add_point(p->post_deps[i].syncobj, p->post_deps[i].chain, p->fence, p->post_deps[i].point);`
          - 否则 drm_syncobj_replace_fence(p->post_deps[i].syncobj, p->fence);
      - 维护 p->ctx->premable_presented
      - cs->out.handle = seq;
        - 最后的用来 fence gang_leader 的大 fence
      - leader->uf_sequence = seq;
        - user fence; 不知道做何用处
      - amdgpu_vm_bo_trace_cs(&fpriv->vm, &p->ticket);
        - Trace all mappings of BOs reserved during a command submission.
      - for gang_size
        - trace_amdgpu_cs_ioctl(p->jobs[i]);
        - drm_sched_entity_push_job(&p->jobs[i]->base);
          - atomic_inc(entity->rq->sched->score);
          - WRITE_ONCE(entity->last_user, current->group_leader);
          - sched_job->submit_ts = submit_ts = ktime_get();
          - first = spsc_queue_push(&entity->job_queue, &sched_job->queue_node);
          - if first, then wake up scheduler
            - drm_sched_rq_add_entity(entity->rq, entity);
              - 加到 rq->entities 里面去，并且 rq->sched->score += 1
            - drm_sched_rq_update_fifo(entity, submit_ts);
              - 
            - drm_sched_wakeup_if_can_queue(entity->rq->sched);
      - amdgpu_vm_move_to_lru_tail(p->adev, &fpriv->vm);
      - ttm_eu_fence_buffer_objects(&p->ticket, &p->validated, p->fence);
    - amdgpu_cs_parser_fini
      - 基本上就是做 cleanup



drm_sched_job - A job to be run by an entity.




amdgpu_ctx: managed by amdgpu_ctx_mgr

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

TTM
- https://lwn.net/Articles/336945/


## 一些问题

1. Fence 和 semaphore 变成了啥
   semaphore 大概看明白了


## 提交简史

核心在于构建 Pal 相关对象

和提交相关的东西：

1. vkQueueSubmit -> 找到内部的 PalQueue, 在 PalQueue 上面做 submit
   如果多个 submitInfo

   - 如果指定了要等的 semaphore 和要 signal 的 semaphore
     - 要等的 semaphore 用 vk::Queue::PalWaitSemaphores
       PalQueue(deviceIdx)->WaitQueueSemaphore
   - 装配 pal command buffer 指针，从 vk::CmdBuffer.PalCmdBuffer
     - 如果用了 cmdBuffer 的 backupBuffer, 就赶紧提交一波 backupBuffer 里面的东西
       - 还得同步，signal + wait 套餐
       - 感觉是为了做一些 walkaround
  如果有要 signal 的 fence
   - 塞到 palSubmitInfo.ppFences 里面
  PalQueue->Submit


Kernel side contract: `src/core/os/amdgpu/include/drm/amdgpu.h`
> drm side 是 `src/core/os/amdgpu/include/drm/amdgpu_drm.h`
1. amdgpu_cs_ctx_create3

```c
/**
 * Create GPU execution Context
 *
 * For the purpose of GPU Scheduler and GPU Robustness extensions it is
 * necessary to have information/identify rendering/compute contexts.
 * It also may be needed to associate some specific requirements with such
 * contexts.  Kernel driver will guarantee that submission from the same
 * context will always be executed in order (first come, first serve).
 *
 *
 * \param   dev      - \c [in] Device handle. See #amdgpu_device_initialize()
 * \param   priority - \c [in] Context creation flags. See AMDGPU_CTX_PRIORITY_*
 * \param   flags    - \c [in] Context creation flags. See AMDGPU_CTX_FLAG_*
 * \param   context  - \c [out] GPU Context handle
 *
 * \return   0 on success\n
 *          <0 - Negative POSIX Error code
 *
 * \sa amdgpu_cs_ctx_free()
 *
*/
int amdgpu_cs_ctx_create3(amdgpu_device_handle dev,
             uint32_t priority,
             uint32_t flags,
             amdgpu_context_handle *context);

```

```c
/**
 * Submit raw command submission to the kernel with a raw BO list handle.
 *
 * \param   dev	       - \c [in] device handle
 * \param   context    - \c [in] context handle for context id
 * \param   bo_list_handle - \c [in] raw bo list handle (0 for none)
 * \param   num_chunks - \c [in] number of CS chunks to submit
 * \param   chunks     - \c [in] array of CS chunks
 * \param   seq_no     - \c [out] output sequence number for submission.
 *
 * \return   0 on success\n
 *          <0 - Negative POSIX Error code
 *
 * \sa amdgpu_bo_list_create_raw(), amdgpu_bo_list_destroy_raw()
 */
int amdgpu_cs_submit_raw2(amdgpu_device_handle dev,
			  amdgpu_context_handle context,
			  uint32_t bo_list_handle,
			  int num_chunks,
			  struct drm_amdgpu_cs_chunk *chunks,
			  uint64_t *seq_no);
```

ctx + bo_list maintained + cs_submit = do things