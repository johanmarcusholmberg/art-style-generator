# Architecture rules

- Classify OpenAI provider failures in `_shared/openai-errors.ts`; billing exhaustion is terminal, while genuine throttling remains retryable, so empty balances do not cause repeated generation attempts.