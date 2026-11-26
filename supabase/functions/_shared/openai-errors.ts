/** Keep billing exhaustion distinct from temporary provider throttling. */
export function classifyOpenAIError(status: number, text: string) {
  let payload: { error?: { code?: string; type?: string; message?: string } } = {};
  try { payload = JSON.parse(text) ?? {}; } catch { /* Non-JSON provider response. */ }
  const error = payload.error;
  const quotaExhausted = [error?.code, error?.type].some(
    (value) => value === "insufficient_quota" || value === "credit_balance_exhausted",
  );
  if (quotaExhausted) {
    return {
      status: 402, code: "quota-exhausted", retryable: false,
      error: "OpenAI API credits are exhausted. Add credits at https://platform.openai.com/settings/organization/billing/ or choose Gemini or SDXL. OpenAI API credits are separate from Lovable credits.",
    };
  }
  if (status === 429) {
    return { status: 429, code: "rate-limit", retryable: true, error: "OpenAI is temporarily rate-limiting requests. Try again shortly." };
  }
  if (status === 401) {
    return { status: 401, code: "missing-key", retryable: false, error: "OpenAI rejected the API key. Update the OpenAI key in your project secrets." };
  }
  if (status === 400) {
    return {
      status: 400, code: "invalid-prompt", retryable: false,
      error: text.includes("safety")
        ? "OpenAI safety system blocked this prompt. Try rewording."
        : "OpenAI rejected the image request. Check the prompt and image settings.",
    };
  }
  return { status: 502, code: "provider-error", retryable: true, error: `OpenAI image service failed (HTTP ${status}). Try again shortly.` };
}