package com.studyos.ai;

import java.util.List;

public interface AiClient {
    IngestPayload extract(byte[] pdfBytes, String courseName);

    /**
     * More questions for existing concepts, drawn only from the lecture PDF those concepts came from.
     * {@code types} is {@code MC}, {@code SHORT_ANSWER}, or {@code BOTH}.
     */
    GeneratePayload generateMore(byte[] pdfBytes, String courseName, List<ConceptFocus> concepts,
                                 int count, String types);

    GradePayload grade(String questionPrompt, String modelAnswer, String rubric, String givenAnswer);
}
