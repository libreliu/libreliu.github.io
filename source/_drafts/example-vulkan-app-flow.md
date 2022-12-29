---
title: 一个示例 Vulkan 程序的全流程记录
date: 2022-12-29
---

## 简介

> 一些有用的链接：
> - [Khronos Blog - Understanding Vulkan Synchronization](https://www.khronos.org/blog/understanding-vulkan-synchronization)
> - [Yet another blog explaining Vulkan synchronization - Maister's Graphics Adventures](https://themaister.net/blog/2019/08/14/yet-another-blog-explaining-vulkan-synchronization/)

本文主要分析 [glfw](https://github.com/glfw/glfw) 库的 [tests/triangle-vulkan.c](https://github.com/glfw/glfw/blob/57cbded0760a50b9039ee0cb3f3c14f60145567c/tests/triangle-vulkan.c) 文件。

## 流程

- demo_init
  - demo_init_connection
    - glfwSerErrorCallback
    - gladLoadVulkanUserPtr: 设定 glad 使用 glfwGetInstanceProcAddress 来装载所有的 Vulkan 函数指针地址
  - demo_init_vk
    - 启用验证层:
      - vkEnumerateInstanceLayerProperties
      - demo_check_layers: 检查需要的验证层集合是否存在
    - glfwGetRequiredInstanceExtensions: 获得需要的平台 Surface 扩展
    - 准备启用的 Instance 扩展列表
      - VK_EXT_debug_report
      - VK_KHR_portability_enumeration
    - vkCreateInstance
    - vkEnumeratePhysicalDevices
    - 检查设备是否支持 VK_KHR_swapchain
      - vkEnumerateDeviceExtensionProperties
    - vkCreateDebugReportCallbackEXT
    - vkGetPhysicalDeviceProperties
    - vkGetPhysicalDeviceQueueFamilyProperties
    - vkGetPhysicalDeviceFeatures
- demo_create_window
  - glfwWindowHint
  - glfwCreateWindow
  - glfwSetWindowUserPointer
  - glfwSetWindowRefreshCallback
  - glfwSetFramebufferSizeCallback
  - glfwSetKeyCallback
- demo_init_vk_swapchain
  - glfwCreateWindowSurface
    - 内部调用 vkCreateWin32SurfaceKHR
  - 查找支持 Present 和 Graphics 的 Queue，需要是同一个 Queue
    - vkGetPhysicalDeviceSurfaceSupportKHR
    - `queueFlags & VK_QUEUE_GRAPHICS_BIT`
  - vkGetDeviceQueue
  - 选择一个最优的 Surface format
    - vkGetPhysicalDeviceSurfaceFormatsKHR
  - vkGetPhysicalDeviceMemoryProperties
- demo_prepare
  - 创建 Command Pool
    - vkCreateCommandPool
  - 分配一个 Command Buffer
    - vkAllocateCommandBuffers
      - VkCommandBufferAllocateInfo:
        - `.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY`
        - `.commandBufferCount = 1`
  - demo_prepare_buffers
    - 检查 Surface Capabilities 和 Present Modes
      - vkGetPhysicalDeviceSurfaceCapabilitiesKHR
      - vkGetPhysicalDeviceSurfacePresentModesKHR
    - 创建交换链
      - 计算 Swapchain Image Extent
      - `.preTransform` 使用 `VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR`，如果没有则使用当前 Surface Transform
      - `.minImageCount` 使用 Surface Capabilities 的 minImageCount
      - `.presentMode` 选择 `VK_PRESENT_MODE_FIFO_KHR`
      - vkCreateSwapchainKHR
      - 如果有老的交换链： vkDestroySwapchainKHR
      - vkGetSwapchainImagesKHR 拿到 VkImage 格式的交换链图像
      - 为每个交换链图像调用 vkCreateImageView 创建 Color Attachment View
        > Componet Swizzle: TODO check spec
  - demo_prepare_depth
    - vkCreateImage 创建 depth image
      - `.arrayLayers` 可以指定 texture array 的 dimension
    - vkGetImageMemoryRequirements 获得 image 的内存要求
    - 选择内存大小和内存类型
      - memory_type_from_properties : todo check this
    - vkAllocateMemory 分配 image 所需内存，返回 VkDeviceMemory
    - vkBindImageMemory 将分配的 VkDeviceMemory 绑定到 VkImage
    - demo_set_image_layout
      - 如果 `demo->setup_cmd` 为空，则
        - 调用 vkAllocateCommandBuffers 从 `demo->cmd_pool` 中分配 `VK_COMMAND_BUFFER_LEVEL_PRIMARY` 的 Buffer
        - vkBeginCommandBuffer
      - 准备 Image Memory Barrier
        - VkImageMemoryBarrier
          - `.srcAccessMask = 0`
            - 不需要给 src stage 的任何读/写操作 made coherent
          - `.dstAccessMask`:
            - 对于 `VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL`，设置为 `VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT`
          - `.oldLayout = VK_IMAGE_LAYOUT_UNDEFINED`，也就是垃圾数据
          - `.newLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL`
      - 录制 Pipeline Barrier
        - vkCmdPipelineBarrier
          - `srcStageMask = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT`，也就是 wait for nothing
          - `dstStageMask = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT`，也就是任何下面的指令在开始前都需要等待 Barrier 执行完
          - 同时传入前面的 Image Mmeory Barrier
    - vkCreateImageView 创建深度缓冲对应图像的 ImageView
  - demo_prepare_textures
    - vkGetPhysicalDeviceFormatProperties 获得 `VK_FORMAT_B8G8R8A8_UNORM` 的 VkFormatProperties
    - 对于每张 texture
      > 用 `texture_object` 来管理每个 texture
      > - VkSampler sampler
      > - VkImage iamge;
      > - VkImageLayout imageLayout;
      > - VkDeviceMemory mem;
      > - VkImageView view;
      > - int32_t tex_width, tex_height;
      - 如果 sampler 支持（对此种 format 的）线性分块 `(props.linearTilingFeatures & VK_FORMAT_FEATURE_SAMPLED_IMAGE_BIT)`
        - demo_prepare_texture_image with required_props = `VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT`
          - vkCreateImage
          - vkGetImageMemoryRequirements
          - memory_type_from_properties
            - 对设备支持的每种内存类型，枚举其是否符合前面 `required_props` 的要求
          - vkAllocateMemory
          - vkBindImageMemory
          - 如果 memory type 有性质 `VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT`
            - vkGetImageSubresourceLayout
            - vkMapMemory: 映射到地址空间
            - 填充之
            - vkUnmapMemory
          - 设置 image layout (前面分析过)
            - `VK_IMAGE_LAYOUT_PREINITIALIZED` -> `VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL`
            - demo_set_image_layout
      - 如果 sampler 不支持对此种 format 的线性分块，但支持 optimal 分块 `(props.optimalTilingFeatures &  VK_FORMAT_FEATURE_SAMPLED_IMAGE_BIT)`
        - 分别准备 host coherent 和 host visible 的 staging texture 和 GPU device local 的 texture
          - demo_prepare_texture_image * 2
            - 这里 device local 的显然没能力初始化
          - 注意 memory props
        - 改 layout 以便使用 transfer 命令
          - staging texture: VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL
          - device local texture: VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL
        - vkCmdCopyImage
        - 将 device local texture 的 layout 改回来
          - demo_set_image_layout
        - demo_flush_init_cmd: 同步方式 flush setup cmd
          - vkEndCommandBuffer
          - vkQueueSubmit
            - no wait / signal semaphores
          - vkQueueWaitIdle
          - vkFreeCommandBuffers
          - `demo->setup_cmd = VK_NULL_HANDLE`
        - demo_destroy_texture_image 销毁 staging texture
      - 创建对应的 sampler 和 Image View
        - vkCreateSampler
        - vkCreateImageView
  - demo_prepare_vertices
    > 这里直接用了 Host visible & Host coherent 的 memory 作为 vertex buffer 
    > 而不是 Device local 的，然后单开 staging buffer 做拷贝.
    > 
    > 应该是偷懒了.jpg
    - vkCreateBuffer
      - with `.usage = VK_BUFFER_USAGE_VERTEX_BUFFER_BIT`
    - vkGetBufferMemoryRequirements
    - memory_type_from_properties
    - vkAllocateMemory
    - vkMapMemory
    - vkUnmapMemory
    - vkBindBufferMemory
    - 配置一些结构体
      - VkPipelineVertexInputStateCreateInfo
        - VkVertexInputBindingDescription
        - VkVertexInputAttributeDescription
  - demo_prepare_descriptor_layout
    - vkCreateDescriptorSetLayout
      - VkDescriptorSetLayoutCreateInfo
      - `.pBindings = &layout_binding`
        - layout_binding: 设置每个 binding 的位置都放什么 - 可以为数组
          ```
          const VkDescriptorSetLayoutBinding layout_binding = {
            .binding = 0,
            .descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
            .descriptorCount = DEMO_TEXTURE_COUNT,
            .stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT,
            .pImmutableSamplers = NULL,
          };
          ```
          See also: https://vkguide.dev/docs/chapter-4/descriptors/
    - vkCreatePipelineLayout
      - VkPipelineLayoutCreateInfo: `demo->pipeline_layout`
        - 指定了到 Descriptor Set Layouts 的数量和数组指针
  - demo_prepare_render_pass
    - vkCreateRenderPass
      - VkRenderPassCreateInfo
        - `.pAttachments`: VkAttachmentDescription
          - `[0]`: Color Attachment
            - `.samples = VK_SAMPLE_COUNT_1_BIT` 图像的 sample 数
            - `.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR` color & depth 内容在 subpass 开始时如何处理
            - `.storeOp = VK_ATTACHMENT_STORE_OP_STORE` color & depth 内容在 subpass 结束后如何处理
            - `.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE` stencil 内容在 subpass 开始时如何处理
            - `.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE` stencil 内容在 subpass 结束时如何处理
            - `.initialLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL` subpass 开始前 image subresource 的 layout
            - `.finalLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL` subpass 结束后 image subresource 将会被自动转换到的 layout
          - `[1]`: Depth Stencil Attachment
            - `.format = demo->depth.format`
            - `.samples = VK_SAMPLE_COUNT_1_BIT`
            - `.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR`
            - `.storeOp = VK_ATTACHMENT_STORE_OP_DONT_CARE`
            - `.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE`
            - `.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE`
            - `.initialLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL`
            - `.finalLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL`
        - `.pSubpasses`: VkSubpassDescription
          > A single render pass can consist of multiple subpasses. Subpasses are subsequent rendering operations that depend on the contents of framebuffers in previous passes, for example a sequence of post-processing effects that are applied one after another. If you group these rendering operations into one render pass, then Vulkan is able to reorder the operations and conserve memory bandwidth for possibly better performance. [Render passes - Vulkan Tutorial](https://vulkan-tutorial.com/Drawing_a_triangle/Graphics_pipeline_basics/Render_passes)
          - `.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS` 该 subpass 支持的 pipeline 类型
          - `.pInputAttachments = NULL`
          - `.pColorAttachments = &color_reference`
            - `VkAttachmentReference {.attachment = 0, .layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL}`
              引用到上面的 `[0]`
          - `.pDepthStencilAttachment = &depth_reference`
            - `VkAttachmentReference {.attachment = 1, .layout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL}`
              引用到上面的 `[1]`
        - `.pDependencies`: VkSubpassDependency 有多个 subpass 时指定 subpass 间的读写依赖关系
          > 和 vkCmdPipelineBarrier + VkMemoryBarrier 差不多，区别只是同步作用域限于指定的 subpass 间，而非所有在前在后的操作 ([Vulkan Spec](https://registry.khronos.org/vulkan/specs/1.3-extensions/html/chap8.html#VkSubpassDependency))
  - demo_prepare_pipeline
    - vkCreatePipelineCache: (*optional* for pipeline creation)
      > 主要用来供实现缓存编译好的 Pipeline; 可以使用 allocator 限制其缓存数据的大小; 可以创建时导入之前 (应用程序) 的 Cache 等
    - vkCreateGraphicsPipelines
      - VkGraphicsPipelineCreateInfo
        - `.layout = demo->pipeline_layout`
        - `.pVertexInputState`: VkPipelineVertexInputStateCreateInfo
          - 已经在 `demo_prepare_vertices` 中准备好
        - `.pInputAssemblyState`: VkPipelineInputAssemblyStateCreateInfo
          - `.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST`
        - `.pRasterizationState`: VkPipelineRasterizationStateCreateInfo
          - `.polygonMode = VK_POLYGON_MODE_FILL`
          - `.cullMode = VK_CULL_MODE_BACK_BIT`
          - `.frontFace = VK_FRONT_FACE_CLOCKWISE`
            - front-facing triangle orientation to be used for culling
          - `.depthClampEnable = VK_FALSE`
            - 不启用深度截断
          - `.rasterizerDiscardEnable = VK_FALSE`
            - 是否在光栅化阶段前立即丢弃片元
          - `.depthBiasEnable = VK_FALSE`
          - `.lineWidth = 1.0f`
            - 光栅化线段宽度
        - `.pColorBlendState`: VkPipelineColorBlendStateCreateInfo
          - `.pAttachments`: VkPipelineColorBlendAttachmentState，对每个 color attachment 定义 blend state
            - `[0]`
              - `.colorWriteMask = 0xf`
                - 写入 RGBA 全部四个通道 ([Vulkan Spec](https://registry.khronos.org/vulkan/specs/1.3-extensions/html/chap29.html#framebuffer-color-write-mask))
              - `.blendEnable = VK_FALSE`
                - 不启用 Blending，直接写入
        - `.pMultisampleState`: VkPipelineMultisampleStateCreateInfo
          - `.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT`
          - `.pSampleMask = NULL`
        - `.pViewportState`: VkPipelineViewportStateCreateInfo
          - `.viewportCount = 1`
          - `.scissorCount = 1`
          - 不过这里用的 **Dynamic State**，也就是 Viewport 和 Scissor 的信息是在录制 Command Buffer 时提供的，创建 Pipeline 时不提供
            - 详情看 `.pDynamicState`
        - `.pDepthStencilState`: VkPipelineDepthStencilStateCreateInfo
          - `.depthTestEnable = VK_TRUE`
          - `.depthWriteEnable = VK_TRUE`
          - `.depthCompareOp = VK_COMPARE_OP_LESS_OR_EQUAL`
          - `.depthBoundsTestEnable = VK_FALSE`
            - Samples coverage = 0 if outside the bound predetermined
            - [28.8. Depth Bounds Test](https://registry.khronos.org/vulkan/specs/1.3-extensions/html/chap28.html#fragops-dbt)
          - `.stencilTestEnable = VK_FALSE` 下面都是 Stencil test 的参数
          - `.back.failOp = VK_STENCIL_OP_KEEP`
          - `.back.passOp = VK_STENCIL_OP_KEEP`
          - `.back.compareOp = VK_COMPARE_OP_ALWAYS`
          - `.front = ds.back`
        - `.pStages`: VkPipelineShaderStageCreateInfo
          - `[0]`
            - `.stage = VK_SHADER_STAGE_VERTEX_BIT`
            - `.pName = "main"`
            - `.module = demo_prepare_vs(demo)`
              - Call demo_prepare_shader_module with vert SPIR-V code
                - vkCreateShaderModule with `size_t codeSize` & `uint32_t *pCode`
          - `[1]`
            - `.stage = VK_SHADER_STAGE_FRAGMENT_BIT`
            - `.pName = "main"`
            - `.module = demo_prepare_fs(demo)`
              - Similar with above
        - `.pDynamicState`: VkPipelineDynamicStateCreateInfo
          - `.pDynamicStates = dynamicStateEnables`
            - 启用了 `VK_DYNAMIC_STATE_VIEWPORT` 和 `VK_DYNAMIC_STATE_SCISSOR`
        - `.renderPass`: VkRenderPass
          传入之前创建的 VkRenderPass
    - vkDestroyPipelineCache
    - vkDestroyShaderModule * 2
      - 删除 vs 和 fs 的两个刚才创建的 Shader Module (`demo_prepare_vs` / `demo_prepare_fs`)
  - demo_prepare_descriptor_pool
    - vkCreateDescriptorPool
      - VkDescriptorPoolCreateInfo
        - `.pPoolSizes = &type_count`
          - VkDescriptorPoolSize
            - `.type = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER`
            - `.descriptorCount = DEMO_TEXTURE_COUNT`
  - demo_prepare_descriptor_set
    - vkAllocateDescriptorSets：按 Descriptor Set Layouts 从 Descriptor Pool 中分配 Descriptor Sets
      - `.pSetLayouts = &demo->desc_layout`
      - `.descriptorPool = demo->desc_pool`
    - vkUpdateDescriptorSets
      支持 Write 和 Copy 两种形式的 Descriptor Set 更新请求
      - VkWriteSescriptorSet
        - `.dstSet = demo->desc_set` 刚分配的 Descriptor Set
        - `.descriptorCount = DEMO_TEXTURE_COUNT`
        - `.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER`
        - `.pImageInfo = tex_descs`
          - VkDescriptorImageInfo: 具体的 Descriptor 内容
            - `.sampler = demo->textures[i].sampler`
            - `.imageView = demo->textures[i].view`
            - `.imageLayout = VK_IMAGE_LAYOUT_GENERAL`
              > 感觉这里应该是选对应的才对，不知道这样可以不可以
  - demo_prepare_framebuffers
    - 创建 `demo->swapchainImageCount` 个 VkFramebuffer
      - vkCreateFramebuffer
        - VkFramebufferCreateInfo
          - `.renderPass = demo->renderpass`
          - `.pAttachments`: VkImageView[]
            - `[0]`: Color Attachment, `demo->buffers[i].view`
              - That is, the swapchain image view
            - `[1]`: Depth Attachment
              - `demo->depth.view`
          - `.width`, `.height`
          - `.layers = 1`
            > 正如 VkImage 创建时也可以选择多 layer 一样，这里也可以；不过 Shader 默认写入第一层，除了 Geometry Shader
            > 
            > 多 layer 的 Image / Framebuffer 在 Shader 里面是用的 texture array 的语法来访问的
- demo_run
  - glfwWindowShouldClose: 检测窗口的 closing 标志
  - glfwPollEvent
  - demo_draw
    - vkCreateSemaphore: `imageAcquiredSemaphore`
    - vkCreateSemaphore: `drawCompleteSemaphore`
    - vkAcquireNextImageKHR
      > 这里有一个问题，这里返回并不意味着 Present 完成 (推荐做法是 Present 设置 Semaphore，然后等 Semaphore)
      > 
      > 那么，什么情况下这里会 block？
      > 也可以参考 [Let's get swapchain's image count straight - StackOverflow](https://stackoverflow.com/questions/64150186/lets-get-swapchains-image-count-straight)
      - `timeout = UINT64_MAX`
      - `semaphore = imageAcquiredSemaphore`
      - `pImageIndex = &demo->current_buffer`: index of the next image to use
        - 完成后会 signal 该 semaphore
      - 返回值
        - VK_ERROR_OUT_OF_DATE_KHR
          - demo_resize: 处理 resize 情况：**Destroy everything**
            - vkDestroyFramebuffer
            - vkDestroyDescriptorPool
            - vkFreeCommandBuffers
            - vkDestroyCommandPool
            - vkDestroyPipeline
            - vkDestroyRenderPass
            - vkDestroyPipelineLayout
            - vkDestroyDescriptorSetLayout
            - vkDestroyBuffer (vertex buffer)
            - vkFreeMemory (vertex buffer memory)
            - vkDestroyImageView
            - vkDestroyImage
            - vkDestroySampler
            - ...
            - call `demo_prepare`
          - demo_draw: 重复调用一下自己
        - VK_SUBOPTIMAL_KHR: 不是最优，但是也能 present，所以不管
    - demo_flush_init_cmd: 同步方式 flush setup cmd
      - vkEndCommandBuffer
      - vkQueueSubmit
        - no wait / signal semaphores
      - vkQueueWaitIdle
      - vkFreeCommandBuffers
      - `demo->setup_cmd = VK_NULL_HANDLE`
    - demo_draw_build_cmd
      - vkBeginCommandBuffer: `demo->draw_cmd`
      - vkCmdPipelineBarrier
        - Execution barrier 部分
          - `srcStageMask = VK_PIPELINE_STAGE_ALL_COMMANDS_BIT`，也就是 wait for everything
          - `dstStageMask = VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT` (Specifies no stage of execution)
            > `VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT` is equivalent to `VK_PIPELINE_STAGE_ALL_COMMANDS_BIT` with VkAccessFlags set to 0 when specified in the first synchronization scope, but specifies no stage of execution when specified in the second scope.
        - Memory barrier 部分: 对 color attachment 做 layout transition
          - 从 `VK_IMAGE_LAYOUT_UNDEFINED` -> `VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL`
          - `.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT`
      - vkCmdBeginRenderPass with `VK_SUBPASS_CONTENTS_INLINE`
        > `VK_SUBPASS_CONTENTS_INLINE` specifies that the contents of the subpass will be recorded inline in the primary command buffer, and secondary command buffers must not be executed within the subpass.
        - VkRenderPassBeginInfo
          - `.renderPass`
          - `.framebuffer` - 选择**当前**的 framebuffer，我们有 `swapchainImageCount` 个
          - `.renderArea`
            - `.offset.{x, y}`
            - `.extent.{width, height}`
          - `.pClearValues = clear_values` (VkClearValue)
            > 这里是和 RenderPassCreateInfo 指定的 attachments 相对应的
            > 
            > `pClearValues` is a pointer to an array of `clearValueCount` VkClearValue structures containing clear values for each attachment, if the attachment uses a `loadOp` value of `VK_ATTACHMENT_LOAD_OP_CLEAR` or if the attachment has a depth/stencil format and uses a `stencilLoadOp` value of `VK_ATTACHMENT_LOAD_OP_CLEAR`. The array is indexed by attachment number. Only elements corresponding to cleared attachments are used. Other elements of pClearValues are ignored.
            - `[0] = {.color.float32 = {0.2f, 0.2f, 0.2f, 0.2f}}`
            - `[1] = {.depthStencil = {demo->depthStencil, 0}}`
              - `demo->depthStencil` 用来加一个“无形的墙”
      - vkCmdBindPipeline
        - `pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS`
      - vkCmdBindDescriptorSets
        - `layout = demo->pipeline_layout`
          Recall: Pipeline layout <= Descriptor Set Layouts
        - Descriptor Sets
      - vkCmdSetViewport
        - VkViewport
          - `.height`, `.width`, `.minDepth`, `.maxDepth`
      - vkCmdSetScissor
        - VkRect2D
          - `.extent.{width, height}`
          - `.offset.{x, y}`
      - vkCmdBindVertexBuffers
        > 看 https://github.com/SaschaWillems/Vulkan/blob/master/examples/instancing/instancing.cpp 可能会印象更深刻
        - firstBinding 参数用于 (CPU 端) 指定绑定到哪里
      - vkCmdDraw
        - `vertexCount = 3`
        - `instanceCount = 1`
        - `firstVertex = 0`
        - `firstInstance = 0`
      - vkCmdEndRenderPass
      - vkCmdPipelineBarrier
        - Execution barrier:
          - `srcStageMask = VK_PIPELINE_STAGE_ALL_COMMANDS_BIT`，也就是 wait for everything
          - `dstStageMask = VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT` (Specifies no stage of execution)
        - Memory barrier:
          > 正如 transfer，present 也需要 layout 改变
          - `.srcAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT`
          - `.dstAccessMask = VK_ACCESS_MEMORY_READ_BIT`
          - `.oldLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL`
          - `.newLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR`
      - vkEndCommandBuffer: `demo->draw_cmd`
    - vkQueueSubmit
      - `.pCommandBuffers = &demo->draw_cmd`
      - `.pWaitSemaphores = &imageAcquiredSemaphore`
      - `.pWaitDstStageMask = &pipe_stage_flags`
        - `pWaitDstStageMask` is a pointer to an array of pipeline stages at which each corresponding semaphore wait will occur.
        - 这里设置成了 `VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT`
        - 所以，相当于啥也没等
      - `.pSignalSemaphores = &drawCompleteSemaphore`
    - vkQueuePresentKHR
      - VkPresentInfoKHR
        - `.pWaitSemaphores = &drawCompleteSemaphore`
        - `.pSwapchains = &demo->swapchain`
          - 可以多个，用来支持多个 swapchain 用一个 queue present 操作进行 present
        - `.pImageIndices = &demo->current_buffer`
      - 返回值
        - VK_ERROR_OUT_OF_DATE_KHR
          - demo_resize
        - VK_SUBOPTIMAL_KHR
          - 啥事不干
    - vkQueueWaitIdle
    - vkDestroySemaphore: `imageAcquiredSemaphore`
    - vkDestroySemaphore: `drawCompleteSemaphore`
  - demo->depthStencil 周期改变
  - vkDeviceWaitIdle
  - 如果到了指定的帧数，则 glfwSetWindowShouldClose
- demo_cleanup
  - 删除一万个东西 (literally)
  - glfwDestroyWindow
  - glfwTerminate