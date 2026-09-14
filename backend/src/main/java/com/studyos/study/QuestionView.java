package com.studyos.study;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.Concept;
import com.studyos.domain.Material;
import com.studyos.domain.Question;
import java.util.List;

/**
 * Wire shape for GET /api/study/next and the quiz: the prompt, the choices, and where the question comes
 * from, never the answer key or eval labels. The topic, lecture and pages let the student check a question
 * against the slides it was drawn from, and the lecture id is what the quiz narrows to the lectures picked.
 * The concept id is how the study page tells which earlier answers a later one has made final, since only a
 * concept's most recent attempt can still be overridden or self-graded.
 */
public record QuestionView(Long id, Long conceptId, String topic, String lecture, Long lectureId, String type,
                           String prompt, List<String> options, String sourcePages) {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    public static QuestionView from(Question q, ObjectMapper mapper) {
        Concept c = q.concept;
        Material m = c == null ? null : c.material;
        return new QuestionView(q.id, c == null ? null : c.id, c == null ? null : c.name,
            m == null ? null : m.filename, m == null ? null : m.id,
            q.type == null ? null : q.type.name(), q.prompt, parseOptions(q, mapper), q.sourcePages);
    }

    static List<String> parseOptions(Question q, ObjectMapper mapper) {
        if (q.optionsJson == null || q.optionsJson.isBlank()) return List.of();
        try {
            return mapper.readValue(q.optionsJson, STRING_LIST);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("question " + q.id + " has malformed optionsJson", e);
        }
    }
}
