package com.studyos.ingest;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.ai.AiException;
import com.studyos.ai.ConceptPayload;
import com.studyos.ai.FakeAiClient;
import com.studyos.ai.IngestPayload;
import com.studyos.ai.QuestionPayload;
import com.studyos.config.AppStudyProps;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
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
    static final LocalDate TODAY = LocalDate.of(2026, 9, 1);
    // ingest only accepts bytes that start with the PDF magic, so every fixture that is meant to
    // reach the provider has to carry it
    static final byte[] PDF = "%PDF-1.7\nnot a real document".getBytes(StandardCharsets.UTF_8);
    static final byte[] PPTX = {'P', 'K', 0x03, 0x04, 0x14, 0x00, 0x06, 0x00};
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
        service = serviceWithDailyLimit(8);
    }

    private IngestService serviceWithDailyLimit(int newConceptsPerDay) {
        return new IngestService(courseRepo, materialRepo, conceptRepo, questionRepo, reviewStateRepo, ai, clock,
            new AppStudyProps(newConceptsPerDay));
    }

    /** A valid payload of {@code n} distinct concepts, each carrying the sample question pair. */
    private static IngestPayload payloadOf(int n) {
        ConceptPayload sample = FakeAiClient.samplePayload().concepts().get(0);
        List<ConceptPayload> concepts = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            concepts.add(new ConceptPayload(
                "concept " + i, sample.summary(), sample.sourcePages(), sample.questions()));
        }
        return new IngestPayload(concepts);
    }

    private static ReviewStateRepo.DueDateCount dueCount(LocalDate dueDate, long total) {
        return new ReviewStateRepo.DueDateCount() {
            @Override public LocalDate getDueDate() { return dueDate; }
            @Override public long getTotal() { return total; }
        };
    }

    private void alreadyScheduled(ReviewStateRepo.DueDateCount... counts) {
        when(reviewStateRepo.findDueDateCountsByConceptCourseIdAndDueDateGreaterThanEqual(1L, TODAY))
            .thenReturn(List.of(counts));
    }

    /** The due dates of every review state the ingest saved, in the order the concepts arrived. */
    private List<LocalDate> savedDueDates() {
        ArgumentCaptor<ReviewState> rs = ArgumentCaptor.forClass(ReviewState.class);
        verify(reviewStateRepo, atLeastOnce()).save(rs.capture());
        return rs.getAllValues().stream().map(x -> x.dueDate).toList();
    }

    @Test
    void successfulIngestPersistsBankAndReviewStates() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "week1.pdf", PDF);
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
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertSame(existing, m);
        assertEquals(0, ai.extractCalls);
    }

    @Test
    void aiFailureRetriesOnceThenFails() {
        ai.nextError = new AiException("boom");
        Material m = service.ingest(1L, "week1.pdf", PDF);
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
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("multiple_choice"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void failedMaterialWithSameHashIsRetried() {
        Course otherCourse = new Course();
        otherCourse.id = 2L;
        Material failed = new Material();
        failed.course = otherCourse;
        failed.filename = "old-name.pdf";
        failed.status = MaterialStatus.FAILED;
        failed.errorMessage = "boom";
        when(materialRepo.findByFileHash(any())).thenReturn(Optional.of(failed));
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertSame(failed, m);
        assertEquals(MaterialStatus.INGESTED, m.status);
        assertNull(m.errorMessage);
        assertSame(course, m.course);
        assertEquals("week1.pdf", m.filename);
        assertEquals(1, ai.extractCalls);
        verify(conceptRepo, times(1)).save(any());
    }

    @Test
    void emptyExtractionRetriesOnceThenFails() {
        ai.nextExtract = new IngestPayload(List.of());
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("no concepts"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void conceptWithNoQuestionsRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        ai.nextExtract = new IngestPayload(List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of())));
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("no questions"));
        assertTrue(m.errorMessage.contains(good.name()));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void mcWithoutOptionsRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload bad = new QuestionPayload("MC", "How many steps in the TCP handshake?",
            null, 2, null, null, List.of(3));
        ai.nextExtract = new IngestPayload(List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of(bad, good.questions().get(1)))));
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("options"));
        assertTrue(m.errorMessage.contains("How many steps"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void mcWithOutOfRangeIndexRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload bad = new QuestionPayload("MC", "How many steps in the TCP handshake?",
            List.of("1", "2", "3", "4"), 4, null, null, List.of(3));
        ai.nextExtract = new IngestPayload(List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of(bad, good.questions().get(1)))));
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("correctIndex"));
        assertTrue(m.errorMessage.contains("How many steps"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void shortAnswerWithoutModelAnswerRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload bad = new QuestionPayload("SHORT_ANSWER", "Describe the TCP three-way handshake.",
            null, null, null, "- names all three segments\n- correct order", List.of(3, 4));
        ai.nextExtract = new IngestPayload(List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of(good.questions().get(0), bad))));
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("modelAnswer"));
        assertTrue(m.errorMessage.contains("Describe the TCP"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void oversizedErrorMessageIsTruncatedSoTheFailedRowSurvives() {
        // Material.errorMessage is a varchar(2000). An oversized message throws at flush, after
        // ingest() has returned, so the whole transaction rolls back and the FAILED row the user
        // is meant to see never exists.
        ai.nextError = new AiException("x".repeat(5000));
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.length() <= 2000,
            "errorMessage must fit varchar(2000) but was " + m.errorMessage.length());
        assertTrue(m.errorMessage.endsWith("[truncated]"), "truncation must be visible in the message");
        // the initial PENDING save plus the FAILED save: the row is written, not rolled back
        verify(materialRepo, times(2)).save(m);
    }

    // --- an upload that is not a PDF is refused before it costs a provider call ---------

    @Test
    void pptxUploadFailsWithoutCallingTheProvider() {
        // the payload is armed so the ingest would succeed on these bytes if the guard let them by
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "climate-lecture.pptx", PPTX);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("PowerPoint"), m.errorMessage);
        assertTrue(m.errorMessage.contains("Export to PDF"), m.errorMessage);
        assertEquals(0, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
        verify(questionRepo, never()).save(any());
        verify(reviewStateRepo, never()).save(any());
    }

    @Test
    void plainTextUploadFailsWithoutCallingTheProvider() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "notes.txt",
            "week 1 lecture notes".getBytes(StandardCharsets.UTF_8));
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("not a PDF"), m.errorMessage);
        assertFalse(m.errorMessage.contains("PowerPoint"), m.errorMessage);
        assertEquals(0, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
        verify(questionRepo, never()).save(any());
        verify(reviewStateRepo, never()).save(any());
    }

    @Test
    void reuploadingTheSameRejectedFileReusesItsFailedRow() {
        // this is why the guard sits below the hash lookup: fileHash is unique, so a second
        // upload of the same .pptx has to land on the existing FAILED row
        Material failed = new Material();
        failed.course = course;
        failed.filename = "climate-lecture.pptx";
        failed.status = MaterialStatus.FAILED;
        failed.errorMessage = "boom";
        when(materialRepo.findByFileHash(any())).thenReturn(Optional.of(failed));
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "climate-lecture.pptx", PPTX);
        assertSame(failed, m);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("PowerPoint"), m.errorMessage);
        assertEquals(0, ai.extractCalls);
    }

    // --- new concepts are spread over the calendar instead of all landing today ---------

    @Test
    void newConceptsSpreadOverConsecutiveDaysUpToTheDailyLimit() {
        service = serviceWithDailyLimit(3);
        ai.nextExtract = payloadOf(7);

        service.ingest(1L, "week1.pdf", PDF);

        assertEquals(List.of(
            TODAY, TODAY, TODAY,
            TODAY.plusDays(1), TODAY.plusDays(1), TODAY.plusDays(1),
            TODAY.plusDays(2)), savedDueDates());
        assertTrue(savedDueDates().stream().noneMatch(d -> d.isBefore(TODAY)),
            "nothing may be scheduled before today");
    }

    @Test
    void partlyFullDaysAreToppedUpBeforeTheIngestMovesOn() {
        service = serviceWithDailyLimit(3);
        // today has one slot left, tomorrow is full, the day after is untouched
        alreadyScheduled(dueCount(TODAY, 2L), dueCount(TODAY.plusDays(1), 3L));
        ai.nextExtract = payloadOf(5);

        service.ingest(1L, "week1.pdf", PDF);

        assertEquals(List.of(
            TODAY,
            TODAY.plusDays(2), TODAY.plusDays(2), TODAY.plusDays(2),
            TODAY.plusDays(3)), savedDueDates());
    }

    @Test
    void theDailyLimitComesFromConfiguration() {
        service = serviceWithDailyLimit(2);
        ai.nextExtract = payloadOf(7);

        service.ingest(1L, "week1.pdf", PDF);

        assertEquals(List.of(
            TODAY, TODAY,
            TODAY.plusDays(1), TODAY.plusDays(1),
            TODAY.plusDays(2), TODAY.plusDays(2),
            TODAY.plusDays(3)), savedDueDates());
    }
}
