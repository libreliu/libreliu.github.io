---
title: SPIR-V 初探
date: 2023-03-29
---

## 简介

本文主要关注 SPIR-V 1.6。

前面分支 / 循环 / 函数等测试主要是在 Fragment 这种 OpEntrypoint 下调用的子函数内部进行测试的。

### See Also

- https://en.wikipedia.org/wiki/Structured_program_theorem
- https://medium.com/leaningtech/solving-the-structured-control-flow-problem-once-and-for-all-5123117b1ee2

## 例子

> 通过例子来学习 SPIR-V 会比较快捷，也比较容易理解。
>
> SPIR-V 本身是 SSA 形式的 IR，且指令 format 较为规整，易于解析 (虽然大家都是调库，也不会用手解析 SPIR-V 的)。
>
> 规范文档参考：
> - [Khronos SPIR-V Registry](https://registry.khronos.org/SPIR-V/)
> - [SPIR-V Unified Specifications](https://registry.khronos.org/SPIR-V/specs/unified1/SPIRV.html)
>
> 同时推荐用 [Shader Playground](https://shader-playground.timjones.io/) 来方便直接看到 SPIR-V Disassembly。
>
> 据博主本人测试，OpenAI 的 GPT-4 有**不错**的 SPIR-V 到 GLSL 反汇编能力。

### Layout

从反汇编结果可以看到，SPIR-V Module 有比较整齐的形式，事实上这些形式是规定好的：[Logical Layout of a Module - SPIR-V Specification](https://registry.khronos.org/SPIR-V/specs/unified1/SPIRV.html#_logical_layout_of_a_module)。

### 简单的函数

函数定义：

```c
#version 310 es

float Circle( vec2 uv, vec2 p, float r, float blur )
{

    float d = length(uv - p);
    float c = smoothstep(r, r-blur, d);
    return c;

}

// skip some lines
```

SPIR-V 反汇编：
```
; == 相关定义 ==
%1 = OpExtInstImport "GLSL.std.450"                        ; 引入外部指令集
%float = OpTypeFloat 32
%v2float = OpTypeVector %float 2
%_ptr_Function_v2float = OpTypePointer Function %v2float
%_ptr_Function_float = OpTypePointer Function %float       ; 定义指针类型，指向的变量的 Storage Class 为 Function
%10 = OpTypeFunction %float %_ptr_Function_v2float %_ptr_Function_v2float %_ptr_Function_float %_ptr_Function_float

; == 函数 ==
%Circle_vf2_vf2_f1_f1_ = OpFunction %float None %10        ; 返回值类型 %float，Function Control 类型无
                                                           ; 函数类型 %10 - float (vec2, vec2, float, float)
         %uv = OpFunctionParameter %_ptr_Function_v2float  ; 拿到各个 parameter 的 result id
          %p = OpFunctionParameter %_ptr_Function_v2float  
          %r = OpFunctionParameter %_ptr_Function_float    
       %blur = OpFunctionParameter %_ptr_Function_float    
         %16 = OpLabel                                     ; 一个基本块的开始 (2.2.5. Control Flow)
          %d = OpVariable %_ptr_Function_float Function    ; 定义 float 变量, Storage Class 为 Function 
          %c = OpVariable %_ptr_Function_float Function    ; => 变量可以被 OpLoad / OpStore
         %39 = OpLoad %v2float %uv                         ; 结果类型 %v2float, 装载 %uv 变量的值
         %40 = OpLoad %v2float %p
         %41 = OpFSub %v2float %39 %40                     ; Operand2 - Operand1，结果类型 %v2float
         %42 = OpExtInst %float %1 Length %41              ; Execute an instruction in an imported set of extended instructions
                                                           ; Set (也就是这里的 %1) is the result of an OpExtInstImport instruction.
                                                           ; 后面的 Set 中的 Instruction 是 “Length”，操作数是 %41
               OpStore %d %42                              ; 存到 %d 变量的存储中
         %44 = OpLoad %float %r
         %45 = OpLoad %float %r
         %46 = OpLoad %float %blur
         %47 = OpFSub %float %45 %46                       ; %blur - %r
         %48 = OpLoad %float %d
         %49 = OpExtInst %float %1 SmoothStep %44 %47 %48  ; SmoothStep(%r, %blur - %r, %d)
               OpStore %c %49
         %50 = OpLoad %float %c
               OpReturnValue %50                           ; 不返回值的话使用 OpReturn
               OpFunctionEnd
```

### 分支

```c
#version 310 es

int testIf(float range) {
    int c = 0;
    if (range < 1.0)
        c = 1;
    else
        c = 2;
    return c;
}

// skip some lines
```

SPIR-V 反汇编：

```
; == 相关定义 ==
      %int_0 = OpConstant %int 0
    %float_1 = OpConstant %float 1

; == 函数 ==
 %testIf_f1_ = OpFunction %int None %22
      %range = OpFunctionParameter %_ptr_Function_float
         %25 = OpLabel                                    ; 基本块开始
        %c_0 = OpVariable %_ptr_Function_int Function
               OpStore %c_0 %int_0
         %68 = OpLoad %float %range                       
         %71 = OpFOrdLessThan %bool %68 %float_1          ; check if %68 (loaded from %range) < %float_1
               OpSelectionMerge %73 None                  ; Declare a structured selection
                                                          ; This instruction must immediately precede either an OpBranchConditional or OpSwitch instruction. That is, it must be the second-to-last instruction in its block.
                                                          ; Selection Control = None; 这里可以给 Hint 提示此分支是否应该 remove
                                                          ; 并且指定 Merge Block 为 %73，也就是分支结束的地方
               OpBranchConditional %71 %72 %75            ; 如果 %71 为 true, 则跳到 %72 标号，否则跳到 %75 标号 - 标志基本块结束
         %72 = OpLabel                                    ; 
               OpStore %c_0 %int_1
               OpBranch %73                               ; Unconditional branch to %73
         %75 = OpLabel
               OpStore %c_0 %int_2
               OpBranch %73
         %73 = OpLabel
         %77 = OpLoad %int %c_0
               OpReturnValue %77
               OpFunctionEnd
```

总结：
1. `OpSelectionMerge`
2. `OpBranchConditional`
3. 两个基本块最后 `OpBranch` 到出口

### 循环

#### 术语

- Merge Instruction: `OpSelectionMerge` 或者 `OpLoopMerge` 两者之一，用在
- Header Block: 包含 Merge Instruction 的 Block
  - Loop Header: Merge Instruction 是 `OpLoopMerge` 的 Header Block
  - Selection Header: `OpSelectionMerge` 为 Merge Instruction, `OpBranchConditional` 是终止指令的 Header Block
  - Switch Header: `OpSelectionMerge` 为 Merge Instruction, `OpSwitch` 是终止指令的 Header Block
- Merge Block: 在 Merge Instruction 作为 Merge Block 操作数的 Block
- Break Block: 含有跳转到被 Loop Header 的 Merge Instruction 定义为 Merge Block 的 Block
- Continue Block: 含有跳转到 `OpLoopMerge` 指令的 Continue Target 的 Block
- Return Block: 包含 `OpReturn` 或者 `OpReturnValue` 的 Block

> GPT-4: 在 SPIR-V 中，Merge Block 是一个特定类型的基本块（Basic Block），用于控制流程结构中收敛控制流的位置。当你在 SPIR-V 中使用分支结构（如 if-else 语句、循环等）时，Merge Block 表示在这些分支结构末端的汇合点。
>
> SPIR-V 中的控制流结构使用特殊的操作码（如 OpSelectionMerge、OpLoopMerge）来定义。这些操作码告诉编译器如何解释控制流图（Control Flow Graph，CFG）。Merge Block 用于表示这些控制流结构的结束位置，它是控制流从不同路径重新合并到一条路径的地方。例如，一个 if-else 语句会有两个分支，这两个分支在 Merge Block 之后合并为单个执行路径。

#### while 循环 - 无 break

```c
int testWhile(int count) {
    int sum = 0;
    while (count >= 0) {
        sum++;
        count--;
    }
    return sum;
}
```

```
%testWhile_i1_ = OpFunction %int None %27
      %count = OpFunctionParameter %_ptr_Function_int
         %30 = OpLabel
        %sum = OpVariable %_ptr_Function_int Function
               OpStore %sum %int_0
               OpBranch %85
         %85 = OpLabel
               OpLoopMerge %87 %88 None                 ; Declare a structured loop.
                                                        ; This instruction must immediately precede
                                                        ; either an OpBranch or OpBranchConditional 
                                                        ; instruction. 
                                                        ; That is, it must be the second-to-last 
                                                        ; instruction in its block.
                                                        ; Merge Block = %87
                                                        ; Continue target = %88
               OpBranch %89
         %89 = OpLabel
         %90 = OpLoad %int %count
         %91 = OpSGreaterThanEqual %bool %90 %int_0     ; 有符号比较; if %90 (=count) >= %int_0 (0)
               OpBranchConditional %91 %86 %87          ; %91 == true ? jump to %86 : jump to %87 (FINISH)
         %86 = OpLabel
         %92 = OpLoad %int %sum
         %93 = OpIAdd %int %92 %int_1
               OpStore %sum %93                         ; sum = sum + 1
         %94 = OpLoad %int %count
         %95 = OpISub %int %94 %int_1
               OpStore %count %95                       ; count = count - 1
               OpBranch %88
         %88 = OpLabel
               OpBranch %85                             ; 无条件回到 Loop 头
         %87 = OpLabel
         %96 = OpLoad %int %sum
               OpReturnValue %96
               OpFunctionEnd
```

相当于翻译成了如下格式的 SPIR-V：
```
%header_block = OpLabel
                OpLoopMerge %merge_block %continue_block
                OpBranch %loop_body

   %loop_test = OpLabel
                OpLoopMerge %loop_merge %loop_cont

   %loop_cond = ...          ; Some calculations
                OpBranchConditional %loop_cond %loop_body %loop_merge
   
   %loop_body = OpLabel
                ...          ; Some codes inside loop body
                OpBranch %loop_cont

   %loop_cont = OpLabel
                OpBranch %loop_test

  %loop_merge = OpLabel
                ...          ; The "following" basic block
```

#### while 循环 - 带 break

```c
int testWhile(int count) {
    int sum = 0;
    while (count >= 0) {
        sum++;
        count--;
        if (count == 2) {
            break;
        }
    }
    return sum;
}
```

SPIR-V 反汇编：
```
%testWhile_i1_ = OpFunction %int None %27
      %count = OpFunctionParameter %_ptr_Function_int
         %30 = OpLabel
        %sum = OpVariable %_ptr_Function_int Function
               OpStore %sum %int_0
               OpBranch %85

         %85 = OpLabel
               OpLoopMerge %87 %88 None
               OpBranch %89

         %89 = OpLabel
         %90 = OpLoad %int %count
         %91 = OpSGreaterThanEqual %bool %90 %int_0
               OpBranchConditional %91 %86 %87

         %86 = OpLabel
         %92 = OpLoad %int %sum
         %93 = OpIAdd %int %92 %int_1
               OpStore %sum %93
         %94 = OpLoad %int %count
         %95 = OpISub %int %94 %int_1
               OpStore %count %95
         %96 = OpLoad %int %count
         %97 = OpIEqual %bool %96 %int_2
               OpSelectionMerge %99 None              ; If 的 Merge Block = %99
               OpBranchConditional %97 %98 %99

         %98 = OpLabel
               OpBranch %87                           ; => break out of the loop => emit instruction
                                                      ;    to branch to while's merge block

         %99 = OpLabel                                ; 正常走 => 到达 while 末尾 => emit 到 while
               OpBranch %88                           ; 的 Continue Block

         %88 = OpLabel                                ; Continue Block 
               OpBranch %85

         %87 = OpLabel                                ; Merge Block
        %101 = OpLoad %int %sum
               OpReturnValue %101
               OpFunctionEnd
```

总结：
- break 作为一个基本块末尾，直接 emit 无条件 branch 来跳到 while 循环的 merge block。

#### for 循环

GLSL 代码：
```c
int testFor(int count) {
    int sum = 0;
    for (int i = 0; i < count; i++) {
        sum += 1;
    }
    return sum;
}
```

SPIR-V 反汇编：
```
%testFor_i1_ = OpFunction %int None %27
    %count_0 = OpFunctionParameter %_ptr_Function_int

         %33 = OpLabel
      %sum_0 = OpVariable %_ptr_Function_int Function
          %i = OpVariable %_ptr_Function_int Function
               OpStore %sum_0 %int_0
               OpStore %i %int_0
               OpBranch %109

        %109 = OpLabel
               OpLoopMerge %111 %112 None
               OpBranch %113

        %113 = OpLabel
        %114 = OpLoad %int %i
        %115 = OpLoad %int %count_0
        %116 = OpSLessThan %bool %114 %115
               OpBranchConditional %116 %110 %111

        %110 = OpLabel
        %117 = OpLoad %int %sum_0
        %118 = OpIAdd %int %117 %int_1
               OpStore %sum_0 %118
               OpBranch %112

        %112 = OpLabel                              ; Continuation Block
        %119 = OpLoad %int %i                       ; for 循环的循环结束操作放到了这里
        %120 = OpIAdd %int %119 %int_1
               OpStore %i %120
               OpBranch %109

        %111 = OpLabel                              ; Merge Block
        %121 = OpLoad %int %sum_0
               OpReturnValue %121
               OpFunctionEnd
```

总结：
- Continuation Block 处现在 emit 了循环后维护操作

### 其它 Scope 的变量

> `OpSource`, `OpName`, `OpMemberName` 属于调试信息。

```c
#version 310 es
precision highp float;
precision highp int;
precision mediump sampler3D;

// Anonymous uniform block - Import member names to shader directly
layout(binding=0) uniform uniBlock {
    uniform vec3 lightPos;
    uniform float someOtherFloat;
};

layout(location = 0) out vec4 outColor;
layout(location = 0) in vec4 vertColor;

// This will not work:
// layout(binding = 0) uniform vec3 lightPos;
//  'non-opaque uniforms outside a block' : not allowed when using GLSL for Vulkan 

void mainImage(out vec4 c, in vec2 f, in vec3 lightPos) {}
void main() {mainImage(outColor, gl_FragCoord.xy, lightPos);}
```

#### Input / Output

> 所有可选 Decoration 可以参考 https://registry.khronos.org/SPIR-V/specs/unified1/SPIRV.html#Decoration

对于 gl_FragCoord：
```
                      OpName %gl_FragCoord "gl_FragCoord"
                      OpDecorate %gl_FragCoord BuiltIn FragCoord
%_ptr_Input_v4float = OpTypePointer Input %v4float
      %gl_FragCoord = OpVariable %_ptr_Input_v4float Input
```

对于 Input Variable：
```
                      OpName %vertColor "vertColor"
                      OpDecorate %vertColor Location 0
%_ptr_Input_v4float = OpTypePointer Input %v4float
                      %vertColor = OpVariable %_ptr_Input_v4float Input
```

对于 Output Variable：
```
                       OpName %outColor "outColor"
                       OpDecorate %outColor Location 0
%_ptr_Output_v4float = OpTypePointer Output %v4float
           %outColor = OpVariable %_ptr_Output_v4float Output
```

使用时直接 `OpLoad` 就可以。

#### Uniform Block (Anonymous)

> 匿名的 Uniform Block，其成员是被引入了 Global Scope 的。
> 
> 可以作为 OpenGL 的 uniforms outside a block 的平替。

```
               OpName %uniBlock "uniBlock"
               OpMemberName %uniBlock 0 "lightPos"
               OpMemberName %uniBlock 1 "someOtherFloat"
               OpName %_ ""
               OpMemberDecorate %uniBlock 0 Offset 0             ; Structure type = %uniBlock
                                                                 ; Member = 0
                                                                 ; Decoration = Offset
                                                                 ; Byte Offset = 0
               OpMemberDecorate %uniBlock 1 Offset 12
               OpDecorate %uniBlock Block                        ; Apply only to a structure type to establish
                                                                 ; it is a memory interface block
               OpDecorate %_ DescriptorSet 0                     ; Apply only to a variable. 
                                                                 ; Descriptor Set is an unsigned 32-bit integer 
                                                                 ; forming part of the linkage between the client
                                                                 ; API and SPIR-V memory buffers, images, etc. 
                                                                 ; See the client API specification for more detail.
               OpDecorate %_ Binding 0                           ; Apply only to a variable.
                                                                 ; Binding Point is an unsigned 32-bit integer
                                                                 ; forming part of the linkage between the client
                                                                 ; API and SPIR-V memory buffers, images, etc.
                                                                 ; See the client API specification for more detail.
   %uniBlock = OpTypeStruct %v3float %float                      ; 后面指定所有成员的类型，这里是 {vec3, float}
%_ptr_Uniform_uniBlock = OpTypePointer Uniform %uniBlock         ; Storage Class = Uniform
          %_ = OpVariable %_ptr_Uniform_uniBlock Uniform
%_ptr_Uniform_v3float = OpTypePointer Uniform %v3float

         %34 = OpAccessChain %_ptr_Uniform_v3float %_ %int_0     ; Create a pointer into a composite object.
                                                                 ; Base = %_, Indexes = {%int_0}
                                                                 ; Each index in Indexes
                                                                 ; - must have a scalar integer type
                                                                 ; - is treated as signed
                                                                 ; - if indexing into a structure, must be an 
                                                                 ;   OpConstant whose value is in bounds for selecting a member
                                                                 ; - if indexing into a vector, array, or matrix, 
                                                                 ;   with the result type being a logical pointer type,
                                                                 ;   causes undefined behavior if not in bounds.
         %35 = OpLoad %v3float %34
```

#### Uniform Block (Named)

把上面的示例程序里面的 `uniform uniBlock` 类型的不具名 Uniform Block 加一个实例名字：

```c
layout(binding=0) uniform uniBlock {
    uniform vec3 lightPos;
    uniform float someOtherFloat;
} uniInst;

// ..skip some lines..
void main() {mainImage(outColor, gl_FragCoord.xy, uniInst.lightPos);}
```

下面是相关的 SPIR-V：

```
               OpName %uniInst "uniInst"
               OpDecorate %gl_FragCoord BuiltIn FragCoord
               OpMemberDecorate %uniBlock 0 Offset 0
               OpMemberDecorate %uniBlock 1 Offset 12
               OpDecorate %uniBlock Block
               OpDecorate %uniInst DescriptorSet 0
               OpDecorate %uniInst Binding 0
   %uniBlock = OpTypeStruct %v3float %float
%_ptr_Uniform_uniBlock = OpTypePointer Uniform %uniBlock
    %uniInst = OpVariable %_ptr_Uniform_uniBlock Uniform
%_ptr_Uniform_uniBlock = OpTypePointer Uniform %uniBlock
    %uniInst = OpVariable %_ptr_Uniform_uniBlock Uniform
         %34 = OpAccessChain %_ptr_Uniform_v3float %uniInst %int_0
         %35 = OpLoad %v3float %34
```

可以看到，主要区别是 `%_` 变成了 `%uniInst`，其实就是 OpName 从 `""` 变成了 `"uniInst"`，这样 SPIR-V 反汇编工具生成的反汇编能更好看一些而已。真正的 Result ID 等的逻辑关系都是没有变化的。

> 当然，不知道反射库依赖不依赖 `OpName`，当然去掉了也不是没法反射就是了，只要 layout 一样，怼上去就得了。

### Sampler
