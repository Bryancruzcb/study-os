package com.studyos.ingest;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.studyos.ai.AiAnswerException;
import com.studyos.ai.AiException;
import com.studyos.ai.ConceptFocus;
import com.studyos.ai.FakeAiClient;
import com.studyos.ai.TitlePayload;
import com.studyos.domain.Concept;
import com.studyos.domain.Course;
import com.studyos.domain.Material;
import com.studyos.domain.MaterialStatus;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.MaterialRepo;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class LectureTitlesTest {
    MaterialRepo materialRepo = mock(MaterialRepo.class);
    ConceptRepo conceptRepo = mock(ConceptRepo.class);
    ScriptedAi ai = new ScriptedAi();
    LectureTitles titles = new LectureTitles(materialRepo, conceptRepo, ai);
    Course course = new Course();

    /** Answers each naming call with the next scripted title, or throws the next scripted error. */
    static class ScriptedAi extends FakeAiClient {
        // stands for a response with no payload at all, since the queue holds no nulls
        static final Object NO_PAYLOAD = new Object();
        final Deque<Object> answers = new ArrayDeque<>();

        void willAnswer(Object... next) { answers.addAll(Arrays.asList(next)); }

        @Override
        public TitlePayload nameLecture(String courseName, List<ConceptFocus> concepts) {
            super.nameLecture(courseName, concepts);
            Object next = answers.removeFirst();
            if (next instanceof RuntimeException e) throw e;
            if (next == NO_PAYLOAD) return null;
            return new TitlePayload((String) next);
        }
    }

    @BeforeEach
    void setUp() {
        course.id = 1L;
        course.name = "ATMS 101";
        when(materialRepo.setTitleIfMissing(anyLong(), any())).thenReturn(1);
        when(conceptRepo.findByMaterialIdOrderByIdAsc(anyLong())).thenAnswer(inv -> List.of(concept(100L, "concept")));
    }

    private Material lecture(long id) {
        Material m = new Material();
        m.id = id;
        m.course = course;
        m.filename = "week" + id + ".pdf";
        m.status = MaterialStatus.INGESTED;
        return m;
    }

    private Concept concept(long id, String name) {
        Concept c = new Concept();
        c.id = id;
        c.name = name;
        c.summary = "summary of " + name;
        c.sourcePages = "3,4";
        return c;
    }

    private void untitled(long... ids) {
        when(materialRepo.findByStatusAndTitleIsNullOrderByIdAsc(MaterialStatus.INGESTED))
            .thenReturn(Arrays.stream(ids).mapToObj(this::lecture).toList());
    }

    @Test
    void titlesUntitledLecturesInOrder() {
        untitled(1L, 2L);
        ai.willAnswer("Albedo and blackbody radiation", "  The greenhouse effect  ");

        assertEquals(2, titles.backfill());

        InOrder order = inOrder(materialRepo);
        order.verify(materialRepo).setTitleIfMissing(1L, "Albedo and blackbody radiation");
        order.verify(materialRepo).setTitleIfMissing(2L, "The greenhouse effect");
    }

    @Test
    void passesTheCourseNameAndTheConceptsInIdOrder() {
        untitled(1L);
        when(conceptRepo.findByMaterialIdOrderByIdAsc(1L))
            .thenReturn(List.of(concept(5L, "albedo"), concept(7L, "blackbody radiation")));
        ai.willAnswer("Albedo and blackbody radiation");

        titles.backfill();

        assertEquals("ATMS 101", ai.lastNameCourse);
        assertEquals(List.of(
                new ConceptFocus(5L, "albedo", "summary of albedo", "3,4"),
                new ConceptFocus(7L, "blackbody radiation", "summary of blackbody radiation", "3,4")),
            ai.lastNameConcepts);
    }

    @Test
    void skipsALectureWithNoConcepts() {
        untitled(1L, 2L);
        when(conceptRepo.findByMaterialIdOrderByIdAsc(1L)).thenReturn(List.of());
        ai.willAnswer("The greenhouse effect");

        assertEquals(1, titles.backfill());

        assertEquals(1, ai.nameCalls);
        verify(materialRepo, never()).setTitleIfMissing(eq(1L), any());
        verify(materialRepo).setTitleIfMissing(2L, "The greenhouse effect");
    }

    @Test
    void leavesTheTitleAloneWhenTheAnswerIsBlankOrTooLong() {
        untitled(1L, 2L, 3L);
        ai.willAnswer("   ", "x".repeat(121), ScriptedAi.NO_PAYLOAD);

        assertEquals(0, titles.backfill());

        assertEquals(3, ai.nameCalls);
        verify(materialRepo, never()).setTitleIfMissing(anyLong(), any());
    }

    @Test
    void doesNotCountALectureThatGotATitleMeanwhile() {
        untitled(1L);
        ai.willAnswer("Albedo and blackbody radiation");
        when(materialRepo.setTitleIfMissing(1L, "Albedo and blackbody radiation")).thenReturn(0);

        assertEquals(0, titles.backfill());
    }

    @Test
    void goesOnAfterOneFailure() {
        untitled(1L, 2L);
        ai.willAnswer(new AiException("grading failed: overloaded"), "The greenhouse effect");

        assertEquals(1, titles.backfill());

        verify(materialRepo, never()).setTitleIfMissing(eq(1L), any());
        verify(materialRepo).setTitleIfMissing(2L, "The greenhouse effect");
    }

    @Test
    void stopsAfterThreeFailuresInARow() {
        untitled(1L, 2L, 3L, 4L, 5L);
        AiException down = new AiException("naming the lecture failed: no API key");
        ai.willAnswer(down, down, down, "never asked", "never asked");

        assertEquals(0, titles.backfill());

        assertEquals(LectureTitles.FAILURES_BEFORE_STOP, ai.nameCalls);
        verify(materialRepo, never()).setTitleIfMissing(anyLong(), any());
    }

    @Test
    void refusedLecturesAtTheFrontDoNotStopTheWalk() {
        untitled(1L, 2L, 3L, 4L, 5L);
        AiAnswerException refused = new AiAnswerException("Claude declined to name this lecture");
        AiAnswerException cutOff = new AiAnswerException("the lecture title ran past the output limit");
        ai.willAnswer(refused, refused, cutOff, refused, "Exploit mitigations");

        assertEquals(1, titles.backfill());

        assertEquals(5, ai.nameCalls);
        verify(materialRepo).setTitleIfMissing(5L, "Exploit mitigations");
    }

    @Test
    void aRefusalBetweenOutagesResetsTheCount() {
        untitled(1L, 2L, 3L, 4L, 5L, 6L);
        AiException down = new AiException("naming the lecture failed: overloaded", new RuntimeException("529"));
        AiAnswerException refused = new AiAnswerException("Claude declined to name this lecture");
        ai.willAnswer(down, down, refused, down, down, "Greenhouse gases");

        assertEquals(1, titles.backfill());

        assertEquals(6, ai.nameCalls);
    }

    @Test
    void anAnswerFailureIsNotAnOutageButACallFailureIs() {
        assertFalse(LectureTitles.isOutage(new AiAnswerException("empty title response")));
        assertTrue(LectureTitles.isOutage(new AiException("naming the lecture failed: 401", new RuntimeException())));
        assertTrue(LectureTitles.isOutage(new IllegalStateException("database unreachable")));
    }

    @Test
    void aSuccessBetweenFailuresKeepsTheWalkGoing() {
        untitled(1L, 2L, 3L, 4L, 5L, 6L);
        RuntimeException boom = new IllegalStateException("boom");
        ai.willAnswer(boom, boom, "Albedo", boom, boom, "Greenhouse gases");

        assertEquals(2, titles.backfill());

        assertEquals(6, ai.nameCalls);
    }

    @Test
    void theStartupJobMakesNoCallWhenTheSettingIsOff() {
        untitled(1L);
        ai.willAnswer("Albedo and blackbody radiation");

        new LectureTitlesOnStart(titles, false).onReady();

        assertEquals(0, ai.nameCalls);
        verifyNoInteractions(materialRepo, conceptRepo);
    }

    @Test
    void theStartupJobRunsTheBackfillWhenTheSettingIsOn() {
        untitled(1L);
        ai.willAnswer("Albedo and blackbody radiation");

        new LectureTitlesOnStart(titles, true).onReady();

        verify(materialRepo).setTitleIfMissing(1L, "Albedo and blackbody radiation");
    }

    @Test
    void theStartupJobNeverThrows() {
        when(materialRepo.findByStatusAndTitleIsNullOrderByIdAsc(any()))
            .thenThrow(new IllegalStateException("database unreachable"));

        assertDoesNotThrow(() -> new LectureTitlesOnStart(titles, true).onReady());
    }
}
