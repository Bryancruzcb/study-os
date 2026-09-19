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
import com.studyos.exam.ExamPlanner;
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
import org.springframework.context.ApplicationEventPublisher;

class IngestServiceTest {
    CourseRepo courseRepo = mock(CourseRepo.class);
    MaterialRepo materialRepo = mock(MaterialRepo.class);
    ConceptRepo conceptRepo = mock(ConceptRepo.class);
    QuestionRepo questionRepo = mock(QuestionRepo.class);
    ReviewStateRepo reviewStateRepo = mock(ReviewStateRepo.class);
    AttemptRepo attemptRepo = mock(AttemptRepo.class);
    ExamRepo examRepo = mock(ExamRepo.class);
    MaterialPdfRepo materialPdfRepo = mock(MaterialPdfRepo.class);
    FakeAiClient ai = new FakeAiClient();
    ExamPlanner examPlanner = mock(ExamPlanner.class);
    ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
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
        when(materialRepo.findByCourseIdAndFileHash(any(), any())).thenReturn(Optional.empty());
        when(materialRepo.findByCourseIdAndFilename(any(), any())).thenReturn(List.of());
        when(materialRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(examRepo.findByLectureId(any())).thenReturn(List.of());
        when(conceptRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(questionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(reviewStateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(materialPdfRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(materialPdfRepo.findById(any())).thenReturn(Optional.empty());
        service = serviceWithDailyLimit(8);
    }

    private IngestService serviceWithDailyLimit(int newConceptsPerDay) {
        return new IngestService(courseRepo, materialRepo, conceptRepo, questionRepo, reviewStateRepo,
            attemptRepo, examRepo, materialPdfRepo, ai, clock, new AppStudyProps(newConceptsPerDay, 0.2),
            examPlanner, events);
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
    void acceptReturnsPendingWithoutCallingTheProvider() {
        Material m = service.accept(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.PENDING, m.status);
        assertEquals(0, ai.extractCalls);
        verify(events).publishEvent(any(IngestRequested.class));
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void processFinishesAPendingMaterial() {
        Material pending = new Material();
        pending.id = 9L;
        pending.course = course;
        pending.status = MaterialStatus.PENDING;
        when(materialRepo.findById(9L)).thenReturn(Optional.of(pending));
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.process(9L, PDF);
        assertEquals(MaterialStatus.INGESTED, m.status);
        assertEquals(1, ai.extractCalls);
        verify(conceptRepo, times(1)).save(any());
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
        when(materialRepo.findByCourseIdAndFileHash(any(), any())).thenReturn(Optional.of(existing));
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
            List.of("1", "2", "3", "4"), 2, null, null, List.of(3), null, null, null);
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
        Material failed = new Material();
        failed.course = course;
        failed.filename = "old-name.pdf";
        failed.status = MaterialStatus.FAILED;
        failed.errorMessage = "boom";
        // looked up inside the course the upload is for, never across courses
        when(materialRepo.findByCourseIdAndFileHash(eq(1L), any())).thenReturn(Optional.of(failed));
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
            null, 2, null, null, List.of(3), null, null, null);
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
            List.of("1", "2", "3", "4"), 4, null, null, List.of(3), null, null, null);
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
            null, null, null, "- names all three segments\n- correct order", List.of(3, 4), null, null, null);
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
        // this is why the guard sits below the hash lookup: a course holds a file once, so a second
        // upload of the same .pptx has to land on the existing FAILED row
        Material failed = new Material();
        failed.course = course;
        failed.filename = "climate-lecture.pptx";
        failed.status = MaterialStatus.FAILED;
        failed.errorMessage = "boom";
        when(materialRepo.findByCourseIdAndFileHash(any(), any())).thenReturn(Optional.of(failed));
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

    @Test
    void anIngestedLectureIsHandedToTheExamPlanner() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material material = service.ingest(1L, "lecture.pdf", PDF);
        assertEquals(MaterialStatus.INGESTED, material.status);
        verify(examPlanner).lectureAdded(material);
    }

    @Test
    void anUploadThatFailsJoinsNoExam() {
        Material material = service.ingest(1L, "slides.pptx", PPTX);
        assertEquals(MaterialStatus.FAILED, material.status);
        verify(examPlanner, never()).lectureAdded(any());
    }

    // --- explanations arrive with the questions ------------------------------------------

    private List<Question> savedQuestions() {
        ArgumentCaptor<Question> saved = ArgumentCaptor.forClass(Question.class);
        verify(questionRepo, atLeastOnce()).save(saved.capture());
        return saved.getAllValues();
    }

    /** The sample payload with its MC question's explanation fields swapped for these. */
    private static IngestPayload mcWith(String explanation, List<String> optionExplanations, String diagram) {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload mc = good.questions().get(0);
        QuestionPayload changed = new QuestionPayload(mc.type(), mc.prompt(), mc.options(), mc.correctIndex(),
            mc.modelAnswer(), mc.rubric(), mc.sourcePages(), explanation, optionExplanations, diagram);
        return new IngestPayload(List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of(changed, good.questions().get(1)))));
    }

    @Test
    void explanationsNotesAndDiagramsAreStoredWithTheirQuestions() {
        ai.nextExtract = FakeAiClient.samplePayload();
        service.ingest(1L, "week1.pdf", PDF);
        Question mc = savedQuestions().get(0);
        Question shortAnswer = savedQuestions().get(1);
        assertEquals("Slide 3 shows SYN, SYN-ACK and ACK before any data moves.", mc.explanation);
        assertEquals("[\"Slide 3 shows more than one segment.\",\"Slide 3 adds an ACK after the SYN-ACK.\","
            + "\"SYN, SYN-ACK and ACK are the three segments on slide 3.\",\"Slide 3 never shows a fourth segment.\"]",
            mc.optionExplanationsJson);
        assertTrue(mc.diagram.startsWith("sequenceDiagram"), mc.diagram);
        assertTrue(shortAnswer.explanation.startsWith("Slides 3 and 4"), shortAnswer.explanation);
        assertNull(shortAnswer.optionExplanationsJson);
        assertNull(shortAnswer.diagram);
    }

    @Test
    void notesThatDoNotLineUpWithTheOptionsAreLeftOffAndTheLectureStillIngests() {
        ai.nextExtract = mcWith("Slide 3 names three segments.", List.of("one note", "two notes", "three notes"), null);
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.INGESTED, m.status);
        assertEquals(1, ai.extractCalls);
        Question mc = savedQuestions().get(0);
        assertEquals("Slide 3 names three segments.", mc.explanation);
        assertNull(mc.optionExplanationsJson);
    }

    @Test
    void aDiagramOfAKindThePageDoesNotDrawIsLeftOff() {
        ai.nextExtract = mcWith("Slide 3.", null, "pie title Segments\n  \"SYN\" : 1");
        service.ingest(1L, "week1.pdf", PDF);
        assertNull(savedQuestions().get(0).diagram);
    }

    @Test
    void aDiagramWithAClickHandlerIsLeftOff() {
        ai.nextExtract = mcWith("Slide 3.", null, "flowchart LR\n  A --> B\n  click A callback");
        service.ingest(1L, "week1.pdf", PDF);
        assertNull(savedQuestions().get(0).diagram);
    }

    @Test
    void anExplanationTooLongForItsColumnIsLeftOffRatherThanFailingTheLecture() {
        // a varchar overflow would throw at flush, after ingest() returned, and roll the lecture back
        ai.nextExtract = mcWith("x".repeat(4001), null, null);
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.INGESTED, m.status);
        assertNull(savedQuestions().get(0).explanation);
    }

    @Test
    void aShortAnswerNeverKeepsOptionNotes() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload sa = good.questions().get(1);
        QuestionPayload withNotes = new QuestionPayload(sa.type(), sa.prompt(), sa.options(), sa.correctIndex(),
            sa.modelAnswer(), sa.rubric(), sa.sourcePages(), sa.explanation(), List.of("a stray note"), null);
        ai.nextExtract = new IngestPayload(List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of(good.questions().get(0), withNotes))));
        service.ingest(1L, "week1.pdf", PDF);
        assertNull(savedQuestions().get(1).optionExplanationsJson);
    }

    @Test
    void reuploadWithSameFilenameReplacesThePriorLecture() {
        Material prior = new Material();
        prior.id = 11L;
        prior.course = course;
        prior.filename = "week1.pdf";
        prior.status = MaterialStatus.INGESTED;
        when(materialRepo.findByCourseIdAndFilename(1L, "week1.pdf")).thenReturn(List.of(prior));
        ai.nextExtract = FakeAiClient.samplePayload();

        Material m = service.ingest(1L, "week1.pdf", PDF);

        assertEquals(MaterialStatus.INGESTED, m.status);
        assertNotSame(prior, m);
        verify(attemptRepo).deleteByQuestionConceptMaterialId(11L);
        verify(questionRepo).deleteByConceptMaterialId(11L);
        verify(reviewStateRepo).deleteByConceptMaterialId(11L);
        verify(conceptRepo).deleteByMaterialId(11L);
        verify(materialRepo).delete(prior);
        // replace mid-ingest does not replan on its own; lectureAdded will after success
        verify(examPlanner, never()).replan(any());
        verify(examPlanner).lectureAdded(m);
    }

    @Test
    void processBailsWhenMaterialWasDeletedDuringQueue() {
        when(materialRepo.findById(11L)).thenReturn(Optional.empty());
        assertNull(service.process(11L, PDF));
        assertEquals(0, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void processBailsWhenMaterialNoLongerPendingAfterExtract() {
        Material pending = new Material();
        pending.id = 11L;
        pending.course = course;
        pending.status = MaterialStatus.PENDING;
        // first load in process(); second after extract in complete()
        when(materialRepo.findById(11L))
            .thenReturn(Optional.of(pending))
            .thenReturn(Optional.empty());
        ai.nextExtract = FakeAiClient.samplePayload();
        assertNull(service.process(11L, PDF));
        assertEquals(1, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
        verify(examPlanner, never()).lectureAdded(any());
    }

    @Test
    void deleteLectureRemovesItsGraphAndReplans() {
        Material lecture = new Material();
        lecture.id = 11L;
        lecture.course = course;
        lecture.filename = "week1.pdf";
        Exam exam = new Exam();
        exam.id = 4L;
        exam.lectures.add(lecture);
        when(materialRepo.findById(11L)).thenReturn(Optional.of(lecture));
        when(examRepo.findByLectureId(11L)).thenReturn(List.of(exam));

        service.deleteLecture(11L);

        assertTrue(exam.lectures.isEmpty());
        verify(examRepo).save(exam);
        verify(attemptRepo).deleteByQuestionConceptMaterialId(11L);
        verify(questionRepo).deleteByConceptMaterialId(11L);
        verify(reviewStateRepo).deleteByConceptMaterialId(11L);
        verify(conceptRepo).deleteByMaterialId(11L);
        verify(materialRepo).delete(lecture);
        verify(examPlanner).replan(1L);
    }

    @Test
    void generateMoreAddsQuestionsUnderTheConcept() {
        Material lecture = new Material();
        lecture.id = 11L;
        lecture.filename = "Lecture 3.pdf";
        lecture.course = course;
        Concept concept = new Concept();
        concept.id = 5L;
        concept.course = course;
        concept.material = lecture;
        concept.name = "TCP handshake";
        concept.summary = "Three-way handshake";
        concept.sourcePages = "3,4";
        when(conceptRepo.findAllById(List.of(5L))).thenReturn(List.of(concept));
        MaterialPdf pdf = new MaterialPdf();
        pdf.materialId = 11L;
        pdf.bytes = PDF;
        when(materialPdfRepo.findById(11L)).thenReturn(Optional.of(pdf));
        ai.nextGenerate = FakeAiClient.sampleGenerate(5L);

        List<Question> saved = service.generateMore(1L, List.of(5L), 1, "MC");

        assertEquals(1, saved.size());
        assertEquals(QuestionType.MC, saved.get(0).type);
        assertEquals(concept, saved.get(0).concept);
        assertEquals(1, ai.generateCalls);
    }

    @Test
    void generateMoreRefusesWhenTheLecturePdfWasNotKept() {
        Material lecture = new Material();
        lecture.id = 11L;
        lecture.filename = "Lecture 3.pdf";
        lecture.course = course;
        Concept concept = new Concept();
        concept.id = 5L;
        concept.course = course;
        concept.material = lecture;
        concept.name = "TCP handshake";
        when(conceptRepo.findAllById(List.of(5L))).thenReturn(List.of(concept));
        when(materialPdfRepo.findById(11L)).thenReturn(Optional.empty());

        var err = assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> service.generateMore(1L, List.of(5L), 1, "BOTH"));
        assertTrue(err.getReason().contains("Re-upload Lecture 3.pdf"));
        assertEquals(0, ai.generateCalls);
    }

    @Test
    void acceptKeepsThePdfBytesForLaterGeneration() {
        when(materialRepo.save(any())).thenAnswer(inv -> {
            Material m = inv.getArgument(0);
            if (m.id == null) m.id = 42L;
            return m;
        });
        Material accepted = service.accept(1L, "w1.pdf", PDF);
        assertEquals(MaterialStatus.PENDING, accepted.status);
        ArgumentCaptor<MaterialPdf> pdf = ArgumentCaptor.forClass(MaterialPdf.class);
        verify(materialPdfRepo).save(pdf.capture());
        assertEquals(42L, pdf.getValue().materialId);
        assertArrayEquals(PDF, pdf.getValue().bytes);
    }
}
