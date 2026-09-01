package com.studyos.ai;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.models.messages.Base64PdfSource;
import com.anthropic.models.messages.ContentBlockParam;
import com.anthropic.models.messages.DocumentBlockParam;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.StructuredMessageCreateParams;
import com.anthropic.models.messages.TextBlockParam;
import com.studyos.config.AppModelProps;
import java.util.Base64;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class AnthropicAiClient implements AiClient {

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
            """.formatted(courseName);
        try {
            DocumentBlockParam doc = DocumentBlockParam.builder()
                .source(Base64PdfSource.builder()
                    .data(Base64.getEncoder().encodeToString(pdfBytes))
                    .build())
                .build();
            StructuredMessageCreateParams<IngestPayload> params = MessageCreateParams.builder()
                .model(models.generation())
                .maxTokens(16000L)
                .outputConfig(IngestPayload.class)
                .addUserMessageOfBlockParams(List.of(
                    ContentBlockParam.ofDocument(doc),
                    ContentBlockParam.ofText(TextBlockParam.builder().text(prompt).build())))
                .build();
            return client.messages().create(params).content().stream()
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
