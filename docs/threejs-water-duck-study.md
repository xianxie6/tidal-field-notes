# Three.js WebGPU Compute Water：小鸭子真实感拆解

参考：

- [Three.js 官方 WebGPU Compute Water 示例](https://threejs.org/examples/webgpu_compute_water.html)
- [Three.js 官方示例源码](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_water.html)
- [官方 duck.glb 文件](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/duck.glb)

## 结论

小鸭子的真实感不是由 WebGPU 自动产生。WebGPU Compute 主要处理水面高度场和鸭子的漂浮动力学；鸭子外观来自预先制作好的 glTF 模型、PBR 材质、HDR 环境反射与色调映射。

## 官方示例的关键组成

1. 使用 `GLTFLoader` 和 `DRACOLoader` 加载 `duck.glb`，不是运行时拼出的基础几何体。
2. 加载 `blouberg_sunrise_2_1k.hdr`，设置为场景环境和背景，并使用约 `1.25` 的环境强度。
3. 使用 ACES Filmic 色调映射；鸭子材质中的平滑塑料表面因此获得连续且清晰的高光。
4. 水面材质 roughness 为 `0`、metalness 为 `0.9`，动态法线让反射随波面变化。
5. 计算着色器输出水面高度与局部法线；每只鸭子读取所在网格位置的数据。
6. 鸭子的高度缓慢追随水面，水平速度接受水面坡度推力并带阻尼，朝向使用缓动，而不是逐帧硬对齐。
7. 鸭体与水面在位置、倾斜、反射上相互一致，因此产生“接触可信度”。

## 对潮下笔记的直接启示

- 鱼体必须先有可信的轮廓、眼睛、鳍、表面法线和材质分区。
- 水下仍然需要环境反射；环境应是青蓝水体、顶部暖光和破碎亮带，而不是摄影棚白光。
- 转向需要方向惯性与侧倾，摆尾频率要和速度关联。
- 后续真实 glTF 鱼类应保留独立眼球、角膜、身体与半透明鳍材质。
- WebGPU/GPU Compute 值得用于更大规模鱼群和流场，但它不会替代模型、PBR 材质和光照设计。

## 本轮实现

- 生成自制的水下等距环境纹理并用于场景反射。
- 鱼体改用反射更清晰的物理材质。
- 为所有鱼增加独立虹膜和高光瞳孔实例，并补充背腹渐变、鳃线、侧线和轻微体表斑纹。
- 朝向从直接赋值改为球面插值，并根据横向速度加入轻微侧倾。
- 加入稀疏的近景横穿鱼群，使上述材质细节在实际画面中可见；远景鱼群仍保持较小尺度。
