package com.studyos.study;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.ai.AiException;
import com.studyos.ai.FakeAiClient;
import com.studyos.ai.GradePayload;
import com.studyos.domain.Question;
import com.studyos.domain.Verdict;
import org.junit.jupiter.api.Test;

class GradingServiceTest {
    FakeAiClient ai = new FakeAiClient();
    GradingService service = new GradingService(ai);
    Question q = new Question();

    @Test
    void correctGradeMapsToVerdict() {
        ai.nextGrade = new GradePayload(true, 0.9, "Good: all three segments named.");
        var out = service.gradeShortAnswer(q, "SYN, SYN-ACK, ACK");
        assertEquals(Verdict.CORRECT, out.verdict());
        assertEquals(0.9, out.score(), 1e-9);
        assertNotNull(out.graderRaw());
    }

    @Test
    void aiFailureYieldsPending() {
        ai.nextError = new AiException("api down");
        var out = service.gradeShortAnswer(q, "SYN, SYN-ACK, ACK");
        assertEquals(Verdict.PENDING, out.verdict());
        assertNull(out.score());
        assertNull(out.graderRaw());
    }

    @Test
    void graderRawIsGradePayloadJson() throws Exception {
        ai.nextGrade = new GradePayload(false, 0.4, "Missing the \"ACK\" segment.");
        var out = service.gradeShortAnswer(q, "SYN, SYN-ACK");
        assertEquals(Verdict.INCORRECT, out.verdict());
        assertEquals(0.4, out.score(), 1e-9);
        assertEquals("Missing the \"ACK\" segment.", out.feedback());
        JsonNode raw = new ObjectMapper().readTree(out.graderRaw());
        assertFalse(raw.get("correct").asBoolean());
        assertEquals(0.4, raw.get("score").asDouble(), 1e-9);
        assertEquals("Missing the \"ACK\" segment.", raw.get("feedback").asText());
    }

    @Test
    void outOfRangeScoreIsAFailureNotAJudgement() {
        // the spec and the README both state the grader's score is 0.0-1.0; anything else means the
        // response was not the judgement it claims to be, and it must not reach the eval dataset
        ai.nextGrade = new GradePayload(true, 1.4, "Good: all three segments named.");
        var out = service.gradeShortAnswer(q, "SYN, SYN-ACK, ACK");
        assertEquals(Verdict.PENDING, out.verdict());
        assertNull(out.score());
        assertNull(out.feedback());
        assertNull(out.graderRaw());
    }

    @Test
    void blankFeedbackIsAFailureNotAJudgement() {
        // GradePayload's fields are primitives, so a body missing them reads as a plausible
        // INCORRECT/0.0; the blank feedback is what gives the empty response away
        ai.nextGrade = new GradePayload(false, 0.0, "   ");
        var out = service.gradeShortAnswer(q, "SYN, SYN-ACK, ACK");
        assertEquals(Verdict.PENDING, out.verdict());
        assertNull(out.score());
        assertNull(out.feedback());
        assertNull(out.graderRaw());
    }
}
