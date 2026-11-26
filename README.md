# Roadrunner Motion Demo

基于自建 Roadrunner 外观模型的网页交互作业。点击网格或输入目标坐标，观察轮腿协同转弯和关节角度反馈。

- 点击「生成并播放」启动移动
- 使用时间轴查看任意姿态
- 拖动视角，滚轮缩放，点击「复位到原点」重新开始

本项目是参考演示视频制作的教学模型与运动学动画。屈膝、侧倾、速度和转弯路径采用演示参数。真实机器人控制策略、工程尺寸与动力学参数仍待取得和验证。

## 本地预览

在本目录运行 Python 3 自带的静态服务。

    python -m http.server 8000

然后访问 http://localhost:8000/ 。

## 项目结构

- index.html 和 studio.css 提供交互界面
- studio.js 创建场景并处理输入与时间轴
- motion.js 实现弧线规划与腿部逆运动学
- assets/Roadrunner-IROS.glb 保存分件模型
- vendor/ 包含 Three.js 及其 MIT 许可证

## 参考来源

- [原 Instagram 演示](https://www.instagram.com/reel/DeHYDXwCmEf/)
- [RAI Institute 官方 Roadrunner 介绍](https://rai-inst.com/resources/videos/meet-roadrunner-a-bipedal-wheeled-robot-for-multi-modal-locomotion/)
- [Upkie 开源轮腿机器人](https://github.com/upkie/upkie)
- [Ascento 全身控制研究](https://www.research-collection.ethz.ch/server/api/core/bitstreams/c0497fd4-e406-40d8-a1a2-49e556f96433/content)

本项目与 RAI Institute 无隶属关系。Third-party Three.js code retains its original MIT license in vendor/LICENSE.


## 横向模式的转弯

选择「髋部旋转 · 横向滑行」后，自动演示侧身沿弧线移动。点击地面可选择任意目标，目标坐标完整保留。左右髋分别取转角，让前后两轮沿各自的转弯轨迹滚动。机身随弯道调整朝向，保持侧身行进关系。右侧显示两侧髋角。

测试覆盖 60 组不同目标和初始机身朝向，验证到点、轮地高度，以及简化髋中心轨迹与轮平面的方向约束。浏览器中默认动作到达 (0.55, 0.25) 米，左右髋角约为 96° 与 84°。

旋转轴位于现有模型髋部连接点，属于网页运动学演示近似。该检查没有验证真实原型轴系、关节限位、完整接触无滑移或主动平衡。Fusion、Blender、MuJoCo 轴系仍待同步。

### 横向腿部姿态修正

对照原片 10–25 秒连续帧，横向姿态采用左右相反的转髋方向。两腿的屈膝平面呈镜像关系，轮子保持同向滚动。运动中维持轻度屈膝，根据弯道分别调整腿部姿态，停下时保留横向屈膝站姿。脚本版本更新为 knees3。

逆运动学求解包含髋部扭转后的轴向和支点变换。验证了多方向目标、轮心高度，以及镜像膝部位置和左右轮转动符号。原片关节角度尚未通过相机标定测量，当前角度与时序采用视觉调校。该版本仍是运动学演示，主动平衡控制与真实轴系仍待核实。
