# 本地即兴对话评分设计

## 目标

把即兴对话的总分从“是否完成、是否开口、文本表面格式”改为可解释的本地评分：优先评估回答是否切题、完整、自然；录音仅可显示浏览器转写所反映的“识别清晰度”，不能冒充真实的发音评分。

## 已确认的范围

- 保持 GitHub Pages 的纯静态部署；不新增后端、账户、密钥、付费服务或网络评分请求。
- 不修改现有资源、对话流程、TTS、录音保存方式或导入逻辑。
- 不把浏览器语音转写或转写置信度称为“发音准确度”。
- 不再给无转写的录音自动授予开口满分。

## 用户可见行为

### 每轮回答质量

对用户自行键入或说出的英文，本地评分函数输出 0–100 的回答质量和可读反馈，分为：

| 维度 | 上限 | 判定依据 |
| --- | ---: | --- |
| 切题 | 50 | 是否回应当前问题类型（时间、地点、数量、是非、原因、偏好或行动），并与示范回答的关键信息相符。 |
| 完整 | 30 | 是否给出足够的信息而不是单个词或无意义片段。 |
| 自然 | 20 | 是否为英文、是否包含可识别的句子结构或自然的简短回答。 |

示例题为 `When will you arrive for the business trip?`：

- `I plan to be there by tomorrow afternoon.`：回答质量应为高分（至少 90）。
- `Maybe tomorrow.`：回答了时间，但信息和句子完整度不足，应为中等分（60–75）。
- `I like pizza.`：与问题无关，应明显低于 `Maybe tomorrow.`。

这是规则化的本地近似评分；页面应说明它评估的是“回答质量”，不能保证理解所有同义的优秀表达。

### 录音识别清晰度

- 若浏览器 SpeechRecognition 返回英文转写和可信度，计算 0–100 的“识别清晰度”；该值单独显示，不叫“发音分”。
- 若仅有转写但浏览器未提供可信度，显示“转写已获得，清晰度无法精确判断”，且不能给 100。
- 若没有转写或浏览器不支持 SpeechRecognition，显示“未测评”，不再以“我开口了”给满分。

### 会话总分

- 每轮手动回答都以回答质量计入会话内容分。
- 有有效识别清晰度的麦克风轮次，最终总分以“回答质量 75% + 识别清晰度 25%”计算。
- 没有任何可用清晰度时，总分就是回答质量；界面明确标为“未进行发音测评”。
- 使用参考说法或跳过仍会降低内容分，但不再把完成次数作为主要加分项。
- 结算页展示：总分、回答质量、识别清晰度（或未测评）、各轮的简短反馈和评分说明。

## 技术设计

### 纯函数接口

`js/app.js` 新增并测试以下纯函数：

```js
evaluateFreeResponse(answer, prompt, suggestions) => {
  score: number,
  relevance: number,
  completeness: number,
  naturalness: number,
  feedback: string[]
}

scoreRecognitionClarity(transcript, confidence) => {
  status: "scored" | "transcript-only" | "unavailable",
  score: number | null,
  label: string
}

scoreFreeSession(turns) => {
  total: number,
  contentScore: number,
  clarityScore: number | null,
  clarityStatus: "scored" | "transcript-only" | "unavailable"
}
```

回答质量的意图由当前对方问题和该轮 `sugs` 推断；不向网络发送文本或音频。词汇比较会去除常见功能词、标点和大小写差异，并用问题类型的本地词表补足直接回答（例如 `When` 对应日期、时间和 `tomorrow`）。

### 录音数据链路

`startASR()` 需保留每个浏览器识别结果的 `confidence`，并同时返回转写文本。录音回合把 `answerEvaluation` 和 `clarity` 存入 `userTurns`，结算只调用 `scoreFreeSession()`，避免 UI 分支各自累计分数。

## 验收条件

1. 示例题中完整示范回答的回答质量至少为 90，且高于 `Maybe tomorrow.` 至少 20 分。
2. `Maybe tomorrow.` 的回答质量在 60–75 之间，并反馈信息不够完整。
3. 无关英文回答显著低于时间简答。
4. 无转写录音不会自动获得 20 或 25 分，也不会显示“发音满分”。
5. 所有当前导入、TTS、最近练习和烟雾测试仍通过。
