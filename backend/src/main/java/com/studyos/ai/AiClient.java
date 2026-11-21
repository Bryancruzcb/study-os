package com.studyos.ai;

import java.util.List;

public interface AiClient {
    /**
     * Extraction asks for this many questions per concept. A student reviews a concept many
     * times, so it needs enough different questions that the reviews do not repeat.
     */
    int MIN_QUESTIONS_PER_CONCEPT = 4;
    int MAX_QUESTIONS_PER_CONCEPT = 6;

    IngestPayload extract(byte[] pdfBytes, String courseName);

    /**
     * More questions for existing concepts, drawn only from the lecture PDF those concepts came from.
     * {@code types} is {@code MC}, {@code SHORT_ANSWER}, or {@code BOTH}.
     */
    GeneratePayload generateMore(byte[] pdfBytes, String courseName, List<ConceptFocus> concepts,
                                 int count, String types);

    GradePayload grade(String questionPrompt, String modelAnswer, String rubric, String givenAnswer);

    /**
     * A title for a lecture that was ingested before titles existed, from its concepts in
     * extraction order. Text only, because an old lecture may have no stored PDF. Throws
     * {@link AiAnswerException} when the model refuses, is cut off or answers with nothing, and
     * {@link AiException} when the call itself fails.
     */
    TitlePayload nameLecture(String courseName, List<ConceptFocus> concepts);
}
