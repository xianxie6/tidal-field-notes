# 海底资产候选记录

在任何第三方模型进入运行时代码前，必须在这里记录来源、许可证、体积和用途。不能仅因为文件位于公开仓库就默认允许复用。

## 已选用

| 名称 | 来源 | 许可证 | 原始大小 | 修改与商用 | 计划用途 | 状态 |
| --- | --- | --- | ---: | --- | --- | --- |
| Barramundi Fish | [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode)；元数据标注 Microsoft / 2017 / Public | 12,488,144 bytes（约 11.91 MiB） | 允许修改和商用，不要求署名；项目仍保留来源记录 | 1 条成鱼和 2 条幼鱼共享同一网格与贴图；远景鱼群仍使用程序化实例 | 已选用；运行时 GLB 约 363 KB |

运行时版本由 glTF-Transform 执行网格量化、1024px WebP 贴图压缩和无用数据清理。原模型无骨骼动画，场景代码仅对近景实例添加纵轴非刚性摆动、转向侧倾和避让。

## 使用原则

- 不把高精模型复制到整个鱼群，只承担近景物种辨识和材质基准。
- 下载原始文件后先检查网格、贴图、动画与材质，再生成压缩运行时版本。
- 运行时不热链 GitHub；最终资源必须随项目本地托管。
- 如模型无法满足动画或体积预算，删除本地副本并回退到程序化主角鱼，不寻找许可证模糊的替代品。
