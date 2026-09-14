package com.studyos.quiz;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.Question;
import java.util.List;

/**
 * What the quiz shows once a question is answered: the key, and why each answer is right or wrong
 * according to the slides. optionExplanations runs in option order and is empty for a short answer;
 * explanation and diagram are null on a question nobody has explained yet.
 */
public record QuestionReview(Long id, Integer correctIndex, String modelAnswer, String rubric,
                             String explanation, List<String> optionExplanations, String diagram) {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    public static QuestionReview from(Question q, ObjectMapper mapper) {
        return new QuestionReview(q.id, q.correctIndex, q.modelAnswer, q.rubric, q.explanation,
            optionExplanations(q, mapper), q.diagram);
    }

    private static List<String> optionExplanations(Question q, ObjectMapper mapper) {
        if (q.optionExplanationsJson == null || q.optionExplanationsJson.isBlank()) return List.of();
        try {
            return mapper.readValue(q.optionExplanationsJson, STRING_LIST);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("question " + q.id + " has malformed optionExplanationsJson", e);
        }
    }
}
