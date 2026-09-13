package com.studyos.ai;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.http.StreamResponse;
import com.anthropic.helpers.MessageAccumulator;
import com.anthropic.models.messages.Base64PdfSource;
import com.anthropic.models.messages.ContentBlockParam;
import com.anthropic.models.messages.DocumentBlockParam;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.RawMessageStreamEvent;
import com.anthropic.models.messages.StopReason;
import com.anthropic.models.messages.StructuredMessageCreateParams;
import com.anthropic.models.messages.TextBlockParam;
import com.studyos.config.AppModelProps;
import java.util.Base64;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class AnthropicAiClient implements AiClient {

    // A lecture's questions come with their explanations, which roughly doubles the output and
    // shares the budget with thinking. The model's full output allowance is only safe streamed:
    // a single response that long would run into the HTTP timeout. Only generated tokens are billed.
    private static final long EXTRACT_MAX_TOKENS = 128_000L;

    private final AnthropicClient client;
    private final AppModelProps models;

    public AnthropicAiClient(AppModelProps models) {
        this.client = AnthropicOkHttpClient.fromEnv();
        this.models = models;
    }

    @Override
    public IngestPayload extract(byte[] pdfBytes, String courseName) {
        String prompt = """
            These are lecture slides for the course "%s". Extract the distinct concepts a student
            must master. For each concept: a short name, a one-line summary, the 1-indexed page
            numbers it comes from, and 2-4 questions. Mix types: "MC" (4 options, correctIndex
            0-3, modelAnswer/rubric null) and "SHORT_ANSWER" (options/correctIndex null, a model
            answer, and a 2-3 bullet grading rubric). Every question must be answerable from the
            slides alone, and its sourcePages must point at the pages that answer it.

            Every question also gets the explanations a quiz shows once it is answered, written
            only from these slides: leave out anything the slides do not say. Cite pages as
            "slide N" (one slide is one page). Plain sentences, no markdown.
            - explanation: why the keyed answer is right, citing at least one slide. For a
              SHORT_ANSWER question, also say what a wrong or incomplete answer misses, using the
              rubric's points.
            - optionExplanations: MC only, null for SHORT_ANSWER. One note per option, in option
              order, on why the slides make that option right or wrong. Do not open a note with a
              verdict word such as Correct or Wrong, and do not refer to options by letter.
            - diagram: Mermaid source only when a structure, flow, sequence or state change on the
              slides makes the answer clearer, otherwise null. Its first line is exactly
              "flowchart TD", "flowchart LR", "sequenceDiagram" or "stateDiagram-v2"; at most about
              12 nodes; quote any label with punctuation, like A["fork()"]; no styling, click
              handlers or init directives.
            """.formatted(courseName);
        try {
            DocumentBlockParam doc = DocumentBlockParam.builder()
                .source(Base64PdfSource.builder()
                    .data(Base64.getEncoder().encodeToString(pdfBytes))
                    .build())
                .build();
            StructuredMessageCreateParams<IngestPayload> params = MessageCreateParams.builder()
                .model(models.generation())
                .maxTokens(EXTRACT_MAX_TOKENS)
                .outputConfig(IngestPayload.class)
                .addUserMessageOfBlockParams(List.of(
                    ContentBlockParam.ofDocument(doc),
                    ContentBlockParam.ofText(TextBlockParam.builder().text(prompt).build())))
                .build();
            MessageAccumulator accumulator = MessageAccumulator.create();
            try (StreamResponse<RawMessageStreamEvent> stream = client.messages().createStreaming(params)) {
                stream.stream().forEach(accumulator::accumulate);
            }
            requireFinished(accumulator.message());
            return accumulator.message(IngestPayload.class).content().stream()
                .flatMap(cb -> cb.text().stream())
                .findFirst()
                .map(t -> t.text())
                .orElseThrow(() -> new AiException("empty extraction response"));
        } catch (AiException e) {
            throw e;
        } catch (Exception e) {
            throw new AiException("extraction failed: " + e.getMessage(), e);
        }
    }

    // A response cut off at the output limit is half a JSON document, and a refusal carries none;
    // either would otherwise reach the FAILED material as an unreadable parse error.
    private static void requireFinished(Message message) {
        StopReason reason = message.stopReason().orElse(null);
        if (StopReason.MAX_TOKENS.equals(reason)) {
            throw new AiException("this lecture's questions and explanations ran past the output limit; "
                + "split the PDF into smaller decks and upload them one at a time");
        }
        if (StopReason.REFUSAL.equals(reason)) {
            throw new AiException("Claude declined to extract questions from this lecture");
        }
    }

    @Override
    public GradePayload grade(String questionPrompt, String modelAnswer, String rubric, String givenAnswer) {
        String prompt = """
            Grade this short-answer response.
            Question: %s
            Model answer: %s
            Rubric: %s
            Student answer: %s
            correct = the answer demonstrates the rubric's required understanding, minor wording
            differences allowed. score in [0.0, 1.0]. feedback = 1-2 sentences, specific.
            """.formatted(questionPrompt, modelAnswer, rubric, givenAnswer);
        try {
            StructuredMessageCreateParams<GradePayload> params = MessageCreateParams.builder()
                .model(models.grading())
                .maxTokens(16000L)
                .outputConfig(GradePayload.class)
                .addUserMessage(prompt)
                .build();
            return client.messages().create(params).content().stream()
                .flatMap(cb -> cb.text().stream())
                .findFirst()
                .map(t -> t.text())
                .orElseThrow(() -> new AiException("empty grading response"));
        } catch (AiException e) {
            throw e;
        } catch (Exception e) {
            throw new AiException("grading failed: " + e.getMessage(), e);
        }
    }
}
