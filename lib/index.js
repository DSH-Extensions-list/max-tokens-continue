// src/index.ts
import z from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
var name = "max-tokens-continue";
var DEFAULT_PROMPT = "Your previous response was cut off by the output-token limit. Continue exactly where you stopped. Do not restart, restate, or summarize anything you already produced, and do not comment on this interruption. If you were issuing a tool call when cut off, re-issue the complete tool call now. If your previous response was already complete, reply with one short sentence confirming that.";
var Config = z.object({
  enabled: z.boolean().default(true),
  maxContinuations: z.number().min(1).max(64).default(9),
  requireProgress: z.boolean().default(true),
  prompt: z.string().min(1).default(DEFAULT_PROMPT)
});
function apply(ctx, config) {
  const cfg = config ?? Config(void 0);
  if (!cfg.enabled) return () => {
  };
  const state = /* @__PURE__ */ new WeakMap();
  function stateOf(agent) {
    let entry = state.get(agent);
    if (entry === void 0) {
      entry = { finish: void 0, chars: 0, countTurn: 0, count: 0 };
      state.set(agent, entry);
    }
    return entry;
  }
  const disposeStream = ctx.on("agent/assistant-stream", ({ agent, frame }) => {
    const entry = stateOf(agent);
    if (frame.type === "start") {
      entry.finish = void 0;
      entry.chars = 0;
      return;
    }
    if (frame.type !== "chunk") return;
    const chunk = frame.chunk;
    switch (chunk.type) {
      case "finish":
        entry.finish = chunk.reason.kind;
        return;
      case "text-delta":
      case "reasoning-delta":
        entry.chars += chunk.text.length;
        return;
      case "tool-call-delta":
        entry.chars += chunk.argumentsDelta.length;
        return;
      default:
        return;
    }
  });
  const disposeStopping = ctx.on("agent/turn-stopping", ({ agent, turn, signal }) => {
    if (signal.aborted) return;
    const entry = state.get(agent);
    if (entry === void 0 || entry.finish !== "max-tokens") return;
    if (cfg.requireProgress && entry.chars === 0) return;
    if (entry.countTurn !== turn) {
      entry.countTurn = turn;
      entry.count = 0;
    }
    if (entry.count >= cfg.maxContinuations) return;
    entry.count += 1;
    entry.finish = void 0;
    agent.steer(createUserMessage({
      content: [{ type: "text", text: cfg.prompt }],
      source: { kind: "max-tokens-continue", form: "notice" }
    }));
  });
  return () => {
    disposeStream();
    disposeStopping();
  };
}
export {
  Config,
  apply,
  name
};
