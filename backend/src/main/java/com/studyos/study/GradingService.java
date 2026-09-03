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
            validate(g);
            return new GradeOutcome(g.correct() ? Verdict.CORRECT : Verdict.INCORRECT,
                g.score(), g.feedback(), toJson(g));
        } catch (AiException e) {
            return new GradeOutcome(Verdict.PENDING, null, null, null);
        }
    }

    // A parse or validation failure is a failure, never a best-effort parse. GradePayload's fields
    // are primitives, so a malformed or empty response deserialises to a plausible-looking
    // INCORRECT/0.0 that would be stored as a real graderVerdict, applied to the schedule and
    // counted in the eval agreement denominator. Throwing here takes the same PENDING path as a
    // provider failure, so a bad response never becomes a judgement.
    private static void validate(GradePayload g) {
        if (g.feedback() == null || g.feedback().isBlank()) {
            throw new AiException("grader returned no feedback");
        }
        if (g.score() < 0.0 || g.score() > 1.0) {
            throw new AiException("grader returned a score outside 0.0-1.0: " + g.score());
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
