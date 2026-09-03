package com.studyos.study;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.Question;
import java.util.List;

/** Wire shape for GET /api/study/next: prompt and choices only, never the answer key or eval labels. */
public record QuestionView(Long id, String type, String prompt, List<String> options, String sourcePages) {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    public static QuestionView from(Question q, ObjectMapper mapper) {
        return new QuestionView(q.id, q.type == null ? null : q.type.name(), q.prompt,
            parseOptions(q, mapper), q.sourcePages);
    }

    private static List<String> parseOptions(Question q, ObjectMapper mapper) {
        if (q.optionsJson == null || q.optionsJson.isBlank()) return List.of();
        try {
            return mapper.readValue(q.optionsJson, STRING_LIST);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("question " + q.id + " has malformed optionsJson", e);
        }
    }
}
