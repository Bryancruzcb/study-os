package com.studyos.ingest;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.ai.AiException;
import com.studyos.ai.ConceptPayload;
import com.studyos.ai.FakeAiClient;
import com.studyos.ai.IngestPayload;
import com.studyos.ai.QuestionPayload;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class IngestServiceTest {
    CourseRepo courseRepo = mock(CourseRepo.class);
    MaterialRepo materialRepo = mock(MaterialRepo.class);
    ConceptRepo conceptRepo = mock(ConceptRepo.class);
    QuestionRepo questionRepo = mock(QuestionRepo.class);
    ReviewStateRepo reviewStateRepo = mock(ReviewStateRepo.class);
    FakeAiClient ai = new FakeAiClient();
    Clock clock = Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC);
    IngestService service;
    Course course = new Course();

    @BeforeEach
    void setUp() {
        course.id = 1L;
        when(courseRepo.findById(1L)).thenReturn(Optional.of(course));
        when(materialRepo.findByFileHash(any())).thenReturn(Optional.empty());
        when(materialRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(conceptRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(questionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(reviewStateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        service = new IngestService(courseRepo, materialRepo, conceptRepo, questionRepo, reviewStateRepo, ai, clock);
    }

    @Test
    void successfulIngestPersistsBankAndReviewStates() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "week1.pdf", new byte[] {1, 2, 3});
        assertEquals(MaterialStatus.INGESTED, m.status);
        verify(conceptRepo, times(1)).save(any());
        verify(questionRepo, times(2)).save(any());
        ArgumentCaptor<ReviewState> rs = ArgumentCaptor.forClass(ReviewState.class);
        verify(reviewStateRepo, times(1)).save(rs.capture());
        assertEquals(1, rs.getValue().intervalDays);
    }

    @Test
    void duplicateHashIsNoOp() {
        Material existing = new Material();
        existing.status = MaterialStatus.INGESTED;
        when(materialRepo.findByFileHash(any())).thenReturn(Optional.of(existing));
        Material m = service.ingest(1L, "week1.pdf", new byte[] {1, 2, 3});
        assertSame(existing, m);
        assertEquals(0, ai.extractCalls);
    }

    @Test
    void aiFailureRetriesOnceThenFails() {
        ai.nextError = new AiException("boom");
        Material m = service.ingest(1L, "week1.pdf", new byte[] {1, 2, 3});
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("boom"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void invalidQuestionTypeRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload bad = new QuestionPayload("multiple_choice", "How many steps in the TCP handshake?",
            List.of("1", "2", "3", "4"), 2, null, null, List.of(3));
        ai.nextExtract = new IngestPayload(List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of(bad, good.questions().get(1)))));
        Material m = service.ingest(1L, "week1.pdf", new byte[] {1, 2, 3});
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("multiple_choice"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }
}
