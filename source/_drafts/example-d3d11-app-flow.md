---
title: 一个示例 D3D11 程序的全流程记录
date: 2022-10-19
---

本篇是笔者进行 RenderDoc drivers 层分析时一并记录下来的，是一个渲染 Cube 的简单 D3D11 程序与 API 交互的全流程的记录。

以 [DirectX11-With-Windows-SDK - Rendering A Cube](https://github.com/libreliu/DirectX11-With-Windows-SDK/tree/master/Project%2001-09/03%20Rendering%20a%20Cube) 为例进行说明。

> DXGI (**D**irect**X** **G**raphics **I**nfrastructure) 负责抽象和交换链、DAL 相关的公共部分。关于 DXGI 的资料可以参考 [MSDN](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/d3d10-graphics-programming-guide-dxgi)。
> 
> DXGI 封装了多种对象：
> - 显示适配器 (IDXGIAdapter): 一般对应一块显卡，也可以对应 Reference Rasterizer，或者支持虚拟化的显卡的一个 VF 等
> - 显示输出 (IDXGIOutput): 显示适配器的输出，一般对应一个显示器
> - 交换链 (IDXGISwapChain): 用来暂存要显示到输出窗口/全屏幕的 1 到多个 Surface 的对象
>   - `g_pSwapChain->GetBuffer` 可以拿到表示 Back Buffer 的 `ID3D11Texture`
>   - 从 `g_pd3dDevice->CreateRenderTargetView` 来创建一个封装该 Texture 的 `ID3D11RenderTargetView`
>   - `g_pd3dDeviceContext->OMSetRenderTargets` 来设置 Pipeline 的 RenderTarget
>   - `g_pd3dDeviceContext->RSSetViewports` 来设置 Pipeline 的 Viewport

<!--

> 和 DRM (master) 的相应概念的对比：
> - NOTE: 我只看过 DRM Master (?) 的相关 API
> 
> DRM 里面有
> - KMS:
>   - CRT Controller, Encoder, Connector, Plane
>   - 感觉 IDXGIAdapter 约等于 /dev/dri/card0 ... 等加速设备
>   - 但也不是，因为 DRM 的 master 节点的访问限制 (?)
>   - TODO: 理一理 DRM
> - Buffer Object Management

-->

## `GameApp::Init()`

- `D3DApp::Init()`
  - `InitMainWindow()`
    - `RegisterClass(WNDCLASS *)`: 注册
    - `AdjustWindowRect()`
    - `CreateWindow()`
    - `ShowWindow()`
    - `UpdateWindow()`
  - `InitDirect3D()`
    - `D3D11CreateDevice()`: 采用 11.1 的 Feature Level，不行则降级

      该函数会返回 Immediate Context (`ID3D11DeviceContext`), 设备 (`ID3D11Device`) 和特性等级
    - `ID3D11Device::CheckMultisampleQualityLevels`: 查询给定 DXGI_FORMAT 是否支持给定倍数的 MSAA
    - 将前面的 `ID3D11Device` Cast 到 `IDXGIDevice`
      > An `IDXGIDevice` interface implements a derived class for DXGI objects that produce image data.
    - `IDXGIDevice::GetAdapter` 拿到 `IDXGIAdapter`
      > The `IDXGIAdapter` interface represents a display subsystem (including one or more GPUs, DACs and video memory).
    - `IDXGIAdapter::GetParent` 拿到 `IDXGIFactory1`
      > 这里的 `GetParent` 是 `IDXGIAdapter` 作为 `IDXGIObject` 的方法，可以获得构造它的工厂类。
      >
      > The `IDXGIFactory1` interface implements methods for generating DXGI objects.
    - 尝试将 `IDXGIFactory1` Cast 到 `IDXGIFactory2` (DXGI 1.2 新增)
      - 如果支持 DXGI 1.2，则用 `CreateSwapChainForHwnd` 来创建交换链
      - 否则，用 `CreateSwapChain` 来创建交换链
      > 这两个函数都可以创建窗口 / 全屏幕交换链；DXGI 1.2 增加了新的、到其它输出目标的交换链创建功能，所以这里进行了重构。
      >
      > 也要注意，不同 DirectX 可以支持的[交换链的交换行为类型](https://learn.microsoft.com/en-us/windows/win32/api/dxgi/ne-dxgi-dxgi_swap_effect)是不同的。大体上，交换链的交换行为可以分为
      > - DISCARD vs SEQUENTIAL: 可以参考 [StackExchange](https://gamedev.stackexchange.com/questions/58654/what-is-the-difference-between-dxgi-swap-effect-discard-and-dxgi-swap-effect-seq)，区别就是一个驱动可以放心扔掉，另一个必须保留回读可能
      > - FILP vs BLIT (Bit Block Transfer): 决定是用交换指针还是数据拷贝的方法来从交换链被 Present 的 Surface 中拿取数据
    - `IDXGIFactory1::MakeWindowAssociation` 来取消让 DXGI 接收 Alt-Enter 的键盘消息并且切换窗口和全屏模式
    - `D3D11SetDebugObjectName()`
      - `ID3D11DeviceChild::SetPrivateData(WKPDID_D3DDebugObjectName, ...)` 来设置资源的内部数据，这里是调试名称
    - `DXGISetDebugObjectName()`
      - `IDXGIObject::SetPrivateData(WKPDID_D3DDebugObjectName, ...)` 来设置资源的内部数据，这里是调试名称
    - `OnResize()`
      - `IDXGISwapChain::ResizeBuffers()`
      - `IDXGISwapChain::GetBuffer()` 拿到 `ID3D11Texture2D` 形式的 Back Buffer
      - `IDXGISwapChain::CreateRenderTargetView()` 创建绑定到上面 Back Buffer 的 Texture 的渲染目标视图
      - `D3D11SetDebugObjectName` 来设置 Back Buffer 的调试名称 
      - `ID3D11Device::CreateTexture2D()` 来创建深度模板缓冲 (Depth Stencil Buffer)，类型 `ID3D11Texture2D`，包含大小，MipLevel，采样描述等
      - `ID3D11Device::CreateDepthStencilView()` 来创建前面缓冲对应的深度模板视图
      - `ID3D11DeviceContext::OMSetRenderTargets()` 来将渲染目标视图和深度木板视图绑定到 Pipeline
      - `ID3D11DeviceConetxt::RSSetViewports()` 绑定 Viewport 信息到光栅器状态
      - `D3D11SetDebugObjectName()` 设置调试前面各种视图对象的对象名
- `InitEffect()`
  - `CreateShaderFromFile()`: 传入 CSO (Compiled Shader Object) 和 Shader 文件，输出 `ID3DBlob *`
    - 如果有缓存，则用 `D3DReadFileToBlob` 装入，并返回
    - `D3DCompileFromFile()`: 编译并生成 `ID3DBlob` 对象
    - 如果指定了缓存路径，则 `D3DWriteBlobToFile()` 进行输出
    > 分别创建了 `vs_5_0` 和 `ps_5_0` Shader Model 的 Shader Blob
  - `ID3D11Device::CreateVertexShader()`，根据 Shader Bytecode 创建 `ID3D11VertexShader` 对象
    > 注意这个函数支持传入 Class Linkage，这是一种在 Shader 间共享类型和变量的机制，在 Shader Model 5 被引入。更详细的用法可以参考 [Dynamic Linking Class | MSDN](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/overviews-direct3d-11-hlsl-dynamic-linking-class)
    > 
    > TODO: 研究一下
  - `ID3D11Device::CreateInputLayout()` 传入输入元素描述符和 Shader，传出 `ID3D11InputLayout` 对象
  - `ID3D11Device::CreatePixelShader()` ，根据 Shader Bytecode 创建 `ID3D11PixelShader` 对象
- `InitResource()`
  - `ID3D11Device::CreateBuffer()` 创建顶点缓冲区 (`ID3D11Buffer`) ，并传入初始化数据
  - `ID3D11Device::CreateBuffer()` 创建索引缓冲区 (`ID3D11Buffer`) ，并传入初始化数据
  - `ID3D11DeviceContext::IASetIndexBuffer()` 设置 Immediate Context 绑定索引缓冲区
  - `ID3D11Device::CreateBuffer()` 创建常量缓冲区 (`ID3D11Buffer`) ，不是用初始化数据
    - 此处设置 `D3D11_BUFFER_DESC` 的 `CPUAccessFlags` 为 `D3D11_CPU_ACCESS_WRITE`，让 CPU 可以改变其值
  - `ID3D11DeviceContext::IASetVertexBuffers()` 设置顶点缓冲区，stride 和 offset
  - `ID3D11DeviceContext::IASetPrimitiveTopology()` 设置图元类型
  - `ID3D11DeviceContext::IASetInputLayout()` 设置输入布局
  - `ID3D11DeviceContext::VSSetShader()` 绑定顶点着色器到 Pipeline
  - `ID3D11DeviceContext::VSSetConstantBuffers()` 设置常量缓冲区
    > 这里当然是拿着 ID3D11Buffer 去设置
  - `ID3D11DeviceContext::PSSetShader()` 设置像素着色器
  - `D3D11SetDebugObjectName()` 将 Input Layout, Shader 和 Buffer 设置好调试用名字

## `GameApp::Run()`

> 关于 Windows 消息机制的相关介绍可以参考 [About messages and message queues | MSDN](https://learn.microsoft.com/en-us/windows/win32/winmsg/about-messages-and-message-queues)。



3. 退出