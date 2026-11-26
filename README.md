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

## 横向滑行模式

选择「髋部旋转 · 横向滑行」后，网页自动演示转髋及横滑。两条腿的演示旋转轴在髋部连接点转动 90°，机身保持朝向，沿机身横向滚动。点击目标时，目标会投影到这条横向轴线上。切回常规模式，髋部先回正，再行驶。横滑动作已检查左右方向、轮地高度、转髋先于位移和机身朝向保持。

该版本新增的是网页运行时的运动学关节。原型真实髋关节轴系与限位尚待确认，此动作采用视觉近似，当前验证覆盖网页动画。
