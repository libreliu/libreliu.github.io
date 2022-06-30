---
title: About me (En)
---

> This page is out-of-date and needs to be updated

## Who am I?
I’m currently an undergraduate student in University of Science and Technology of China, major in Computer Science.

I’m interested in several fields in CS:

- Heterogeneous computing and FPGA
- High Performance Computing
- Hacking with computer systems
- Computer Graphics
- Retrocomputing
- ...

I’m also interested in interpreting worlds in a computational way, for example Physics Engines used in games, and numerical solvers.

My Github: https://github.com/libreliu

## Some of my projects
Below illustrates some of my projects that I’ve participated.

### IncludeOS (ARM port)
IncludeOS is a single address space library os for modern C++ baremetal programming. IncludeOS boasts flexible configuration and plentiful supporting libraries in C++, and a dedicated libc is provided to give limited interoperability with POSIX environments to reduce migration cost.

IncludeOS is always using the latest C++ design methodology in the project, hence highly object oriented and efficient for experienced C++ programmers.

In 2019 Spring, I (Libre Liu), together with several others, finished the early stage of migration. The works are part of the Operating System: Principle and Design (H) course. The Chinese version of the migration description along with course work report can be found at OSH-2019/x-ridiculous-includeos.

We’ve learned the necessary technique to examine, build and modify large projects in this process. We’ve experienced fine-control of linker behaviour and remote debugging procedure during the project.

In 2020 Spring, I’m working to submit the code we’ve previously written to upstream. Detailed code on this can be found at libreliu/IncludeOS. The arm_dev branch helds the code I’m working, and master branch helds the work previously done.

A separate bootloader specifically designed for booting IncludeOS under Raspberry Pi 3b+ can be found at libreliu/aarch64-boot

### OpenLaserComm
OpenLaserComm is a FPGA project, aiming to provide transparent transmission for 100Mbps Ethernet over Free Space Optics. The early concept comes from modulatedlight.org, and the project we’re doing is still at its early stage.

We’ve chosen Xilinx Zynq SoC and Zybo evaluation boards as our platform. The Zynq SoC contains two Cortex-A9 core along with Programmable Logic, and we aim to do Ethernet related processing in ARM Core, while doing clocking recovery, frame synchronization and (de)modulation in the PL part.

We’ve currently able to send messages on top of one ARM core with AXI CDMA IP Core, modulated with 8b/10b encoding (on PL transferred with AXI4-Stream), going through a pair of jump wire reaching the other end, doing clocking recovery with FF on PL, and receiving on the ARM core with another AXI CDMA IP Core. Detailed code and reports can be seen in libreliu/OpenLaserComm.

### Storm RDMA Optimization
I’ve participated in The 7th APAC Student RDMA Programming Competition held by HPC-AI Advisory Council, and our team won the champion.

We’ve been working to RDMAize inter-worker communication in Apache Storm, a free and open source stream processing system. We’ve figured out how Storm carrys out its communication between workers, and wrote two RDMAized messaging plugins with different libraries. I’ve written one of them using zrlio/DiSNI.

Our reports submitted to the competition committee is available under libreliu/storm-optimization-reports, including performance evaluations of several applications under typical Infiniband environment.

The DiSNI version of the RDMAized Storm is available under libreliu/storm.

### SCGY PXE Recovery Utility
<!-- Startup Splash of the tailored TinyCore Linux -->

This is a project for USTC-SCGY (School of the Gifted Young) computer room. SCGY Computer Room lacks decent recovery solution for managers and users, and deleting malicious and ad softwares are tedious and inefficient. With the help of Peter Gu, we implemented the PXE recovery utility for our computer room.

The utility itself contains a preconfigured iPXE bootloader, a tailored TinyCore Linux for image downloading and recovery, and a preconfigured GRUB running on local system, to dump the image to the disk (WIM format).

Detailed implementation can be seen at PeterGu’s blog (Chinese).

Code (iPXE script and initrd for TinyCore Linux): libreliu/scgy-pxe-recovery (Gitee).

Usage Guide: Ourscgy @ USTC website

### Other Course Projects
- VGA terminal, course project for Computer Organization and Design
  Software running is written in C and cross-compiled with mipsel-linux-gnu-gcc
  the UART is memory-mapped to the core processor
  The CPU part is built with Chisel, and the rest in Verilog
  Built with Digilent Nexys4-DDR evaluation board, with Artix-7 FPGA
  Project Link (Chinese): https://github.com/libreliu/COD-Resources-2017/tree/master/libreliu/CompDesign/lab6
- Simple FPGA Ethernet Demo, course project for Analog and Digital Circuits
  Uses AXI TrafficGen and AXI EthernetLite IP Core
  Send dummy Ethernet frames, observable under Wireshark
  Project Link (Chinese): https://github.com/libreliu/COD-Resources-2017/tree/master/libreliu/DigiCirc
- Yet Another SHell (yash), course lab for Operating System Principle and Design (H)
  Uses yacc and lex to do shell command parsing
  Project Link (Chinese): https://github.com/libreliu/OSH-2019-Labs/tree/master/lab2

### Hobby

#### Life as a HAM
Got my first callsign BG6HIB last year. Still a newbie here!

Planning to play in HF this year. Got my HF license last December (2019/12).