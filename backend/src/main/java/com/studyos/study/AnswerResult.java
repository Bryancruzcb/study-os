package com.studyos.study;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.Attempt;
import com.studyos.domain.Question;
import com.studyos.domain.QuestionType;
import com.studyos.domain.Verdict;
import java.util.List;

/** The answer result includes an answer key only after the attempt has been recorded. */
public record AnswerResult(Long id, Verdict verdict, Double score, String feedback, String answerKey) {
    public static AnswerResult from(Attempt attempt, ObjectMapper mapper) {
        return new AnswerResult(
            attempt.id,
            attempt.verdict,
            attempt.score,
            attempt.feedback,
            answerKey(attempt.question, mapper));
    }

    private static String answerKey(Question question, ObjectMapper mapper) {
        if (question.type == QuestionType.SHORT_ANSWER) return question.modelAnswer;
        if (question.correctIndex == null) return null;

        List<String> options = QuestionView.parseOptions(question, mapper);
        int index = question.correctIndex;
        return index >= 0 && index < options.size() ? options.get(index) : null;
    }
}
