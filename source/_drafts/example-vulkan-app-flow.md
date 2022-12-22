---
title: 一个示例 Vulkan 程序的全流程记录
date: 2022-12-20
---

## 简介


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
  
      VkCommandBufferAllocateInfo:
      -  `.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY`
      -  `.commandBufferCount = 1`
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
      - 设置 Image Memory Barrier
        - VkImageMemoryBarrier
    - vkCreateImageView 创建深度缓冲对应图像的 ImageView
  - demo_prepare_textures
  - demo_prepare_vertices
  - demo_prepare_descriptor_layout
  - demo_prepare_render_pass
  - demo_prepare_pipeline
  - demo_prepare_descriptor_pool
  - demo_prepare_descriptor_set
  - demo_prepare_framebuffers
- demo_run
- demo_cleanup