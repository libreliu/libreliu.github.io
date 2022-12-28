---
title: 一个示例 Vulkan 程序的全流程记录
date: 2022-12-20
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
        - demo_flush_init_cmd
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
      - VkPipelineLayoutCreateInfo
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
    - vkCreatePipelineCache
    - vkCreateGraphicsPipelines
    - vkDestroyPipelineCache
    - vkDestroyShaderModule
    - vkDestroyShaderModule
  - demo_prepare_descriptor_pool
  - demo_prepare_descriptor_set
  - demo_prepare_framebuffers
- demo_run
- demo_cleanup