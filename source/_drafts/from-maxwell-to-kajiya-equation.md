---
title: 从 Maxwell 方程组到 Kajiya 渲染方程
date: 2022-08-07
---

<!-- https://news.ycombinator.com/item?id=25306168 -->
<!-- STATUS:
DRAFT 22/8/7: Found material interesting:

Maxwell's -> Fourier optics (scalar wave phenomena) -> Eikonal equation (rays, but in inhomogeneous media) -> Ray optics (rays, but in almost-everywhere homogeneous media).

I think most modern optics textbooks (see, e.g., Fundamentals of Photonics) cover the reductions and the corresponding steps.
-->

## Maxwell 方程组

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac {\rho} {\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}} {\partial t} \\
\nabla \times \mathbf{B} &= \mu_0\left(\mathbf{J} + \varepsilon_0 \frac{\partial \mathbf{E}} {\partial t} \right) 
\end{aligned}
$$
