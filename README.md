# 長坂單騎 · 趙雲無雙（Voxel Musou）

体素风三国无双，复刻 x.com/cholf5/status/2103288041242816559 转发的 voxel-musou.vercel.app（BubuAi，three.js）。
原作无 license，只当玩法参考看了页面和模块结构；代码、模型、关卡全部自写：所有模型是 JS 里程序化生成的体素（`voxel.js`），不用 Blender、不加载 GLB。

## 运行

- 开发：`.claude/launch.json` 的 `voxel-musou`（8208，`serve.py` 带 `Cache-Control: no-store`，python 自带 http.server 会让浏览器缓存 ES 模块、改了代码不生效）
- 截图接收：`python shot_server.py shots`（8209），页面里 `__vm.capture(name)` 落盘到 `shots/`；`python sheet.py <前缀> [列数] [缩放]` 拼成联系表
- 单文件：`python build_dist.py` → `dist/index.html`（离线，three 以 data: URL 内嵌，`voxel-musou-dist` 8210）+ `dist/artifact.html`
- Artifact：https://claude.ai/artifact/6vHvvz97Ud36zWFPoh2RDW
- 在线：https://leigaorobot.github.io/changban-musou/ （仓库 https://github.com/LeiGaoRobot/changban-musou ，Pages 从 master 的 `docs/` 发布）
- 更新发布：`python build_dist.py` → `cp dist/index.html docs/` → commit → push → Artifact 同路径重发

## 玩法

- WASD 移动，J 普攻（N1–N6 六段），K 蓄力（N 段后接出 C1–C6：挑空 / 旋挑 / 百烈突 / 旋风 / 龙突进 / 跃斩震地），Space 跳（空中 J 连斩 ×3、K 下刺），L/Shift 闪避（无敌帧），I 无双（气力满；HP<25% 为真・无双 ×1.6）
- 流程：KO 50 → 夏侯恩（掉青釭劍，攻击 ×1.3、枪光变蓝）→ 25 秒或再 KO 80 → 晏明 + 淳于導 → 张郃（BOSS）→ 张飞在长坂桥接应，走上桥即胜利
- 掉落：肉包（队长 55%，回 25%）、酒（旗手 35%，无双全满）、武将掉大肉包
- 评价：突围 / 8 分钟内 / 击破 300 / 受伤 <400 / 连击 ≥60，满 5 项 S
- 手柄（□△×○ R1）、触屏（左摇杆 + 右侧按钮 + 空白处拖动转镜头）

## 结构

- `voxel.js`：`Vox` 体素网格 → 带顶点 AO 的 BufferGeometry；角色部件、武器、兵卒部件、龙、道具、城墙、长坂桥、旗帜贴图。v2 起角色用 3 cm 体素（`VS = 0.03`），造型靠 `ell / layer / cylY / recolor / face` 这组形状助手（椭球、超椭圆切片、锥柱、按规则重上色、在正面表面画/凸一格）而不是堆方盒；`lam()` 生成札甲纹；`down()` 减半分辨率给 LOD 用
- `anim.js`：数值姿势（`w` = 武器在躯干空间的位姿，双手按 `gR/gL` 握点做两骨 IK）、关键帧采样、跑步/待机程序姿势
- `hero.js`：招式表 `MOVES`（帧数 / 取消窗 / 突进 / 判定形状）+ 状态机；`crowd.js`：兵卒 SoA 模拟（方阵推进、围圈、攻击令牌、弓兵抛射、受击反应）+ InstancedMesh 渲染 + 四员武将（复用主角招式动画，带红色预警圈）
- `musou.js`：无双时间轴 + 体素青龙（每个 sim 帧记录龙头轨迹，身体按历史采样）；`vfx.js`：枪光拖尾、火花、碎块、尘土、冲击环、预警贴花；`audio.js`：WebAudio 合成音效 + 太鼓/二胡五声音阶配乐

## 模型 v2（2026-10-02）

- 角色 3 cm 体素：圆头、收窄下巴、眼睛带高光、刘海/发髻/马尾、札甲躯干、三层肩甲、护臂护胫、带褶三段披风、叶形枪头；武将带头盔（盔缨/护颈/护颊/角）、胡须、披风
- 兵卒三档 LOD：镜头 10 m 内 3 cm（最多 40 人）、30 m 内 6 cm、更远 12 cm；倒地的和镜头背后的不用高模/不画。`低畫質` 开关关掉最高档（触屏设备默认开）
- 青龙 7 cm 体素：鳞片、鹿角、须、鬃、背鳍；身体沿龙头轨迹按弧长等距摆放
- 场景：城墙 25 cm 砖缝 + 垛口 + 马面 + 城楼（红柱、花窗、歇山瓦顶），长坂桥 12.5 cm 带栏杆，火盆/拒马/马车/木箱/军帐/兵器架重做，地上插着箭
- 面数：开局约 160 万，混战峰值约 200 万（没做 LOD 前是 335 万）；CPU 每帧 2.6–3.9 ms。实时帧率未测（验证时面板处于后台，rAF 不跑）

## 测试钩子（`window.__vm`）

`start()`、`step(n)`（关 rAF 手动推帧）、`simRun(秒)`（一次别超过约 140 秒模拟，javascript_tool 会超时）、`auto.on = true`（自动驾驶：追最近敌将/兵、按危险区闪避、满气放无双、到桥）、`capture(name)`、`info()`、`officer(k)`；`__vm.DIR.src` 按来源统计受到的伤害，`window.__camOv = [dx,dy,dz,lx,ly,lz]` 把镜头钉在主角相对位置看特写。

平衡基线（自动驾驶，2026-09-25）：两局均胜，3:55 / 3:58，击破 815 / 857，受伤约 1200（含回血）。真人不会完美闪避，预计 6–8 分钟。
