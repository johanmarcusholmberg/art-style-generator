import { describe, expect, it } from "vitest";
import { classifyOpenAIError } from "../../supabase/functions/_shared/openai-errors";

describe("OpenAI provider failure classification", () => {
  it.each(["insufficient_quota", "credit_balance_exhausted"])("treats %s as terminal billing exhaustion", (code) => {
    const result = classifyOpenAIError(429, JSON.stringify({ error: { code } }));
    expect(result.status).toBe(402);
    expect(result.code).toBe("quota-exhausted");
    expect(result.retryable).toBe(false);
  });
  it("recognizes insufficient_quota in type when code differs", () => {
    expect(classifyOpenAIError(429, JSON.stringify({ error: { type: "insufficient_quota", code: "other" } })).retryable).toBe(false);
  });
  it("keeps genuine rate limits retryable", () => {
    expect(classifyOpenAIError(429, JSON.stringify({ error: { code: "rate_limit_exceeded" } }))).toMatchObject({ status: 429, code: "rate-limit", retryable: true });
  });
  it("handles non-JSON provider failures without throwing", () => {
    expect(classifyOpenAIError(503, "Service unavailable")).toMatchObject({ status: 502, retryable: true });
  });
  it("does not retry invalid keys or requests", () => {
    expect(classifyOpenAIError(401, "{}").retryable).toBe(false);
    expect(classifyOpenAIError(400, "{}").retryable).toBe(false);
  });
});