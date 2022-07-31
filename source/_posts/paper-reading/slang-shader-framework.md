---
layout: 'paper-reading'
title: '论文阅读 | Slang'
date: 2022-07-31
papertitle: 'Slang: language mechanisms for extensible real-time shading systems'
paperauthors: Yong He, Kayvon Fatahalian, Tim Foley
papersource: 'SIGGRAPH 2018'
paperurl: 'http://graphics.cs.cmu.edu/projects/slang/'
status: Complete
---

## 简介

Slang 是在 HLSL 之上扩展的着色器语言，其旨在保证**没有额外性能损失**的情况下，解决现代游戏引擎和实时渲染应用中出现的，不同光源 / 材质组合出现的 Shader 代码膨胀、晦涩难懂的基于宏的复用等问题。

Slang 针对原 HLSL，主要增加了以下的新特性：
1. 带可选成员类型约束的接口系统 (Interfaces)
   - 以及 `extension` 关键字来覆盖接口系统的默认行为，提供最大灵活性
2. 泛型系统 (Generics)
3. 显式参数块 (Explicit Parameter Blocks)
4. Slang 编译器和提供运行时类型特化支持的编译器运行时 API
5. (论文发表后新增) 语法糖和其它易用性改进
   - 类 C# 的 getter/setter 语法糖
   - 运算符重载
   - 模块系统
7. (论文发表后新增) CUDA, OptiX 等非传统 Shader 编译目标

从上面可以看出，Slang 自论文发布后还存在有功能演进，说明作为 Shader 语言本身还是有一定生命力的。

截至 2022 年 7 月 31 日，[Slang 的 GitHub 仓库](https://github.com/shader-slang/slang) 共有 978 个 Star，235 Open Issue 和 284 Closed Issue，最后一次提交在两天前，证明项目还是比较活跃的。

> Note: 据我浅薄的了解，HLSL 也在不断迭代新的功能，如 [HLSL 2021](https://devblogs.microsoft.com/directx/announcing-hlsl-2021/) 的 `template` 泛型支持等。~~不过 GLSL 好像没啥大动作~~(?)

## Slang 语言特性介绍

### 接口系统 (Interfaces)

Slang 的接口表示一种约定，比如约定里面会有某种特定函数原型的函数实现，某种特定的成员结构体等，与 "traits" 的语言概念比较接近。

```c#
// define a interface
interface IFoo
{
    int myMethod(float arg);
}

// declare that MyType have conformance to interface IFoo
struct MyType : IFoo
{
    int myMethod(float arg)
    {
        return (int)arg + 1;
    }
}
```

### 泛型系统 (Generics)

泛型系统可以实现同时支持不同类型实例的函数。特别的，可以约束传入的形参类型为实现某种接口的类型，如下面的 `myGenericMethod` 约束 `T` 为实现 `IFoo` 接口的类型。

```c
// define
int myGenericMethod<T: IFoo>(T arg)
{
    return arg.myMethod(1.0);
}

// invoke
MyType obj;
int a = myGenericMethod<MyType>(obj); // OK, explicit type argument
int b = myGenericMethod(obj); // OK, automatic type deduction
```

同时，Slang 还支持类似 C++ 的非类型模板形参的泛型参数输入，比如下面的 `N`：

```c#
struct Array<T, let N : int>
{
    T arrayContent[N];
}
```

函数，`struct` 等语言组件都支持泛型。

> Note: HLSL 本身就支持作为 struct 的 arg 拥有成员函数。

### 显式参数块 (Explicit Parameter Blocks)

> 这个特性在 Slang 官方的语言文档中没有着重强调，主要是在 Slang 的这篇论文中强调了。

现代图形 API（D3D12, Vulkan）对于 Shader 的输入参数是以 "parameter block" 的形式来组织的（例：Vulkan 中术语为 Descriptor Set），一个 Shader 的输入可以由多个 Descriptor Set 组成。

考虑到场景的绘制过程中，有一部分 Shader 参数是不变的（比如同一个绘制到主 RenderTarget 的 Pass 中摄像机的位置），那么把这些不变的参数单独拿出来组织成一个 Parameter Block，把剩下的一些变化频率不太一致的另一些参数（比如模型的 `modelMatrix`）拿出来作为一个或多个 Parameter Block 的话，就可以降低一部分绘制时的开销。

但是手工组织 Shader 的 layout（特别是对于不同的材质，我们有不同的 Shader 要用）是比较繁琐的，Slang 则对这个 Parameter Binding 和 Parameter Block 有专门的设计（`Shader Parameters`），可以方便的自动推导符合程序员设计要求的 layout 和 block。

### 编译器和运行时 API

Slang 提供了功能丰富的运行时 API，其功能经过一些演进和论文中描述的也不是特别一致了。

Slang 的运行时 API 大概提供了如下机制：
1. 运行时 Shader 编译和特化 API
   - 比如，运行时要对新的材质类型重新编译 Shader，就可以使用这些 API
2. 反射机制
   - 可以获得某段 Slang Shader 中的函数、Shader 入口参数等信息

### 语法糖

Slang 的文档中描述了不少 Slang 的语法糖和易用性改进。

#### 类似 C# 的 getter / setter 语法糖

```c#
struct MyType
{
    uint flag;

    property uint highBits
    {
        get { return flag >> 16; }
        set { flag = (flag & 0xFF) + (newValue << 16); }
    }
};
```

#### 基于**全局函数**的运算符重载

> HLSL 2021 支持了基于**成员函数**的运算符重载：[Announcing HLSL 2021
>  - DirectX Developer Blog](https://devblogs.microsoft.com/directx/announcing-hlsl-2021/)
> 
> 而 GLSL 截至 2022 年 7 月 31 日还在咕咕：[Operator overloading · Issue #107 · KhronosGroup/GLSL](https://github.com/KhronosGroup/GLSL/issues/107)

```c#
struct MyType
{
    int val;
    __init(int x) { val = x; }
}

MyType operator+(MyType a, MyType b)
{
    return MyType(a.val + b.val);
}

int test()
{
    MyType rs = MyType(1) + MyType(2);
    return rs.val; // returns 3.
}
```

#### 模块机制

Slang 支持一个简单的模块机制，可以把要 import 的目标模块（就是一个 .slang 的 Slang Shader）中的定义导入当前单元。如果该模块此时再被其它模块 import 的话，这些被导入的模块是不会导入到它的“上一层”的单元中的。

```java
// MyShader.slang

// 正常的导入
import YourLibrary;

// 当然，也可以导入时覆盖前面描述的行为
__export import SomeOtherModule;
```

## 重构 Falcor 渲染器

Falcor 是一个基于 D3D12 的实时渲染器。

> 根据 README，Vulkan 实验性支持在进行中。

作者从 Falcor 的 2.0.2 版本出发，重构了 5400 行着色器代码。

改进主要集中在如下方面：

1. 将一个大的 Parameter Block 拆分成 per-material 的 block
2. Falcor 原来的 Material 采用层次化的设计，每一层 (e.g. GGX, Lambertian, Phong) 都和下一层进行 blend，而渲染时，根据不同的 material 要 dispatch 不同的 shader 时，采用了很多 `#define` 和基于文本的 Shader Varient Cache 的查询环节。
   
   作者重构时将这套系统用 Slang 的泛型系统重构，并且将标准材质的 Varient 用非类型形参编码成了若干个 int，进而加快了查询速度。
3. 针对与 Material 类似的技术，实现了光源上的特化，在场景中只有某种类型光源的时候采用静态特化好的 Shader 变体，减少运行时判断的开销

### 性能

通过重构 Falcor 渲染器，在 NVIDIA 的 ORCA 场景上的测试表明
- 每帧 CPU 执行时间降低了 30%
- 光源和材料特化改进对部分场景的 GPU 时间有加速作用

### 可扩展性

作者分别在重构前和重构后的 Falcor 上实现了（基于 LTC 方法的）多边形面光源，
- 重构前：需要改动 7 处，4 个文件，246 行
- 重构前，但加入光源分离机制：需要改动 8 处，5 个文件，253 行
- 重构后：只需要改动 1 处，1 个文件，249 行

## 结论

> We believe that all real-time graphics programmers could benefit from
> a new generation of shader compilation tools informed by these
> ideas. —— *Slang: language mechanisms for extensible real-time shading systems*

