---
title: SPIR-V 初探 (二) - 类型系统
date: 2023-06-14
---

SPIR-V 的类型可以按如下方式进行分类：

> - OpenCL 才会用到的东西没有列出 (e.g. Capability DeviceEnque, Pipes)

- 基本类型
  - OpTypeVoid
  - OpTypeBool
  - OpTypeInt
    - Width, Signedness
  - OpTypeFloat
    - Width
  - OpTypeOpaque (需要 Kernel Capability)
  - OpTypeSampler
- 复合类型: 该类型的定义需要引用到其他 type 的 id
  - OpTypeVector
    - **\<id\>** Component Type
    - Component Count
  - OpTypeMatrix (需要 Matrix Capability)
    - **\<id\>** Column Type (of type OpTypeVector)
    - Column Count
  - OpTypeImage
    - **\<id\>** Sampled Type (of scalar numerical type or void)
    - Dim
    - Depth
    - Arrayed
    - MS (Multisampled content)
    - Sampled
    - Image Format
  - OpTypeSampledImage
    - **\<id\>** Image type (of type OpTypeImage)
  - OpTypeArray
    - **\<id\>** element type
    - **\<id\>** length (of constant instruction / integer-type scalar)
  - OpTypeRuntimeArray (编译时长度未定; 需要 Shader Capability)
    - **\<id\>** element type
  - OpTypeStruct
    - **\<id\>**... member(s) type
      - If an operand is not yet defined, it must be defined by an OpTypePointer, where the type pointed to is an OpTypeStruct.
  - OpTypePointer
    - Storage class
      - If there was a forward reference to this type from an OpTypeForwardPointer, the Storage Class of that instruction must equal the Storage Class of this instruction.
    - **\<id\>** type
  - OpTypeForwardPointer (需要 Addresses, PhysicalStorageBufferAddresses；看起来是搞链表之类的要用)
    - **\<id\>** pointer type (= a result id of OpTypePointer pointing to OpTypeStruct)
    - Storage class
  - OpTypeFunction
    - **\<id\>** return type
    - **\<id\>**... Parameter(s) type

除此之外，每个类型还可能有装饰 (Decorations)：

类型系统的相关代码可以参考 SPIRV-Tools 的
- `source/opt/types.h`
- `source/opt/type_manager.h`