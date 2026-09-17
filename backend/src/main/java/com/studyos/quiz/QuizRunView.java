package com.studyos.quiz;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.QuizProgress;
import java.util.List;
import java.util.Map;

/**
 * A quiz as the page keeps it between visits: which questions, in asking order, what has been
 * answered, and whether the run is finished. Matches the frontend QuizRun shape.
 */
public record QuizRunView(List<Long> order, Map<String, QuizAnswerView> answers, boolean finished) {
    private static final TypeReference<List<Long>> ORDER = new TypeReference<>() {};
    private static final TypeReference<Map<String, QuizAnswerView>> ANSWERS = new TypeReference<>() {};

    public record QuizAnswerView(Integer picked, String text, boolean correct) {}

    public static QuizRunView from(QuizProgress row, ObjectMapper mapper) {
        try {
            return new QuizRunView(
                mapper.readValue(row.orderJson, ORDER),
                mapper.readValue(row.answersJson, ANSWERS),
                row.finished);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("quiz progress " + row.id + " has malformed JSON", e);
        }
    }

    public void writeInto(QuizProgress row, ObjectMapper mapper) {
        try {
            row.orderJson = mapper.writeValueAsString(order);
            row.answersJson = mapper.writeValueAsString(answers);
            row.finished = finished;
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("quiz run could not be stored", e);
        }
    }
}
