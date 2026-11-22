package com.studyos.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.StopReason;
import com.anthropic.models.messages.Usage;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class TokenUsageLineTest {

    @Test
    void aCallIsLoggedWithTheModelThatAnsweredAndItsTokenCounts() {
        Message message = message("claude-opus-5-5", usage(61_234, 48_211).build(), StopReason.END_TURN);

        assertThat(TokenUsageLine.of("extract", message)).isEqualTo(
            "claude usage call=extract model=claude-opus-5-5 input_tokens=61234 output_tokens=48211"
                + " cache_write_tokens=0 cache_read_tokens=0 stop_reason=end_turn");
    }

    @Test
    void cachedTokensAreCountedApartFromInput() {
        Usage cached = usage(900, 40)
            .cacheCreationInputTokens(1_200L)
            .cacheReadInputTokens(3_400L)
            .build();

        assertThat(TokenUsageLine.of("grade", message("claude-sonnet-5-5", cached, StopReason.END_TURN)))
            .isEqualTo("claude usage call=grade model=claude-sonnet-5-5 input_tokens=900 output_tokens=40"
                + " cache_write_tokens=1200 cache_read_tokens=3400 stop_reason=end_turn");
    }

    @Test
    void cacheCountsSentAsZeroReadTheSameAsCacheCountsLeftOut() {
        Usage zeros = usage(61_234, 48_211)
            .cacheCreationInputTokens(0L)
            .cacheReadInputTokens(0L)
            .build();
        Usage leftOut = usage(61_234, 48_211).build();

        assertThat(TokenUsageLine.of("extract", message("claude-opus-5-5", zeros, StopReason.END_TURN)))
            .isEqualTo(TokenUsageLine.of("extract", message("claude-opus-5-5", leftOut, StopReason.END_TURN)))
            .contains(" cache_write_tokens=0 cache_read_tokens=0 ");
    }

    @Test
    void aResponseCutOffAtTheOutputLimitSaysSo() {
        Message cutOff = message("claude-opus-5-5", usage(50_000, 128_000).build(), StopReason.MAX_TOKENS);

        assertThat(TokenUsageLine.of("extract", cutOff))
            .contains(" output_tokens=128000 ")
            .endsWith(" stop_reason=max_tokens");
    }

    @Test
    void aResponseWithNoStopReasonIsStillLogged() {
        Message unfinished = message("claude-opus-5-5", usage(10, 0).build(), null);

        assertThat(TokenUsageLine.of("nameLecture", unfinished)).endsWith(" stop_reason=none");
    }

    /** Counts with the cache fields left out; a test that needs them sets them. */
    private static Usage.Builder usage(long input, long output) {
        return Usage.builder()
            .inputTokens(input)
            .outputTokens(output)
            .cacheCreation(Optional.empty())
            .cacheCreationInputTokens(Optional.empty())
            .cacheReadInputTokens(Optional.empty())
            .inferenceGeo(Optional.empty())
            .serverToolUse(Optional.empty())
            .serviceTier(Optional.empty());
    }

    private static Message message(String model, Usage usage, StopReason stopReason) {
        return Message.builder()
            .id("msg_test")
            .content(List.of())
            .model(model)
            .stopReason(Optional.ofNullable(stopReason))
            .stopSequence(Optional.empty())
            .container(Optional.empty())
            .stopDetails(Optional.empty())
            .usage(usage)
            .build();
    }
}
