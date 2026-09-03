package com.studyos.study;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.ai.AiClient;
import com.studyos.ai.AiException;
import com.studyos.ai.GradePayload;
import com.studyos.domain.Question;
import com.studyos.domain.Verdict;
import org.springframework.stereotype.Service;

@Service
public class GradingService {
    private final AiClient ai;
    private final ObjectMapper mapper = new ObjectMapper();

    public GradingService(AiClient ai) {
        this.ai = ai;
    }

    public record GradeOutcome(Verdict verdict, Double score, String feedback, String graderRaw) {}

    public GradeOutcome gradeShortAnswer(Question q, String answerText) {
        try {
            GradePayload g = ai.grade(q.prompt, q.modelAnswer, q.rubric, answerText);
            return new GradeOutcome(g.correct() ? Verdict.CORRECT : Verdict.INCORRECT,
                g.score(), g.feedback(), toJson(g));
        } catch (AiException e) {
            return new GradeOutcome(Verdict.PENDING, null, null, null);
        }
    }

    private String toJson(GradePayload g) {
        try {
            return mapper.writeValueAsString(g);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("could not serialize grade: " + e.getMessage(), e);
        }
    }
}
