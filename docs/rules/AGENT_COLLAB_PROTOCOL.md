# Agent Collaboration Protocol

## 目的

确保 Agent 协作是“有证据的协作”，不是口头流程。

## 强制产物

每次任务必须至少包含以下 5 类记录：

1. **Product Brief**
   - 目标、范围、验收标准、优先级
2. **Architecture Note**
   - 关键边界、数据/接口约束、权衡说明
3. **Implementation Delta**
   - 变更文件清单 + 变更目的
4. **Design Review**
   - 审查结论（通过/驳回）+ 修正项 + 至少一条视觉检查证据
5. **Quality Evidence**
   - `audit/verify/test/start` 执行结果摘要

## 判定规则

- 缺任一产物 => 协作无效，不得宣称完成。
- 只有 Product Agent 可以给最终“验收通过”结论。
