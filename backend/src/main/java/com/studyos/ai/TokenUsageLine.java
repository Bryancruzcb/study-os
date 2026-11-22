package com.studyos.ai;

import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.StopReason;
import com.anthropic.models.messages.Usage;

/**
 * The log line for one Claude call: what it was billed for, in tokens. Prices change and are
 * not in the code, so a deployment's cost is worked out from these counts (docs/DEPLOY.md).
 * Whoever reads the log matches on the field names, so renaming one breaks them.
 */
final class TokenUsageLine {

    private TokenUsageLine() {}

    /**
     * The counts are the API's own, and each is billed at its own rate: input_tokens leaves
     * out cached tokens, which are in the two cache counts, and output_tokens includes the
     * model's thinking.
     *
     * @param call which {@link AiClient} operation made the request, such as "extract"
     * @param message the complete response; for a streamed call, the accumulated message,
     *     whose usage holds the final counts
     */
    static String of(String call, Message message) {
        Usage usage = message.usage();
        return ("claude usage call=%s model=%s input_tokens=%d output_tokens=%d"
            + " cache_write_tokens=%d cache_read_tokens=%d stop_reason=%s")
            .formatted(call, message.model().asString(), usage.inputTokens(), usage.outputTokens(),
                usage.cacheCreationInputTokens().orElse(0L), usage.cacheReadInputTokens().orElse(0L),
                message.stopReason().map(StopReason::asString).orElse("none"));
    }
}
