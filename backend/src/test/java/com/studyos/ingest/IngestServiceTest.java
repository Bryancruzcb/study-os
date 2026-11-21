package com.studyos.ingest;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.studyos.ai.AiAnswerException;
import com.studyos.ai.AiException;
import com.studyos.ai.ConceptPayload;
import com.studyos.ai.FakeAiClient;
import com.studyos.ai.GeneratePayload;
import com.studyos.ai.GeneratedQuestionPayload;
import com.studyos.ai.IngestPayload;
import com.studyos.ai.QuestionPayload;
import com.studyos.config.AppStudyProps;
import com.studyos.domain.*;
import com.studyos.exam.ExamPlanner;
import com.studyos.repo.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
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
    // four real pages: the sample payload cites slides 3 and 4, and a citation past this fails
    static final byte[] PDF = pdfWithPages(4);
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
        return new IngestPayload(null, concepts);
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
        assertEquals(4, m.pageCount);
        assertEquals(1, ai.extractCalls);
        verify(conceptRepo, times(1)).save(any());
    }

    @Test
    void successfulIngestPersistsBankAndReviewStates() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.INGESTED, m.status);
        assertEquals(4, m.pageCount);
        verify(conceptRepo, times(1)).save(any());
        verify(questionRepo, times(2)).save(any());
        ArgumentCaptor<ReviewState> rs = ArgumentCaptor.forClass(ReviewState.class);
        verify(reviewStateRepo, times(1)).save(rs.capture());
        assertEquals(1, rs.getValue().intervalDays);
    }

    @Test
    void anIngestedLectureKeepsTheTitleExtractionGaveIt() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "Lecture 3 Fall 2026.pdf", PDF);
        assertEquals("The TCP handshake", m.title);
    }

    @Test
    void aTitleIsTrimmedBeforeItIsStored() {
        ai.nextExtract = new IngestPayload("  Albedo and blackbody radiation \n", payloadOf(1).concepts());
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals("Albedo and blackbody radiation", m.title);
    }

    @Test
    void aMissingBlankOrOverlongTitleIsLeftOffAndTheLectureStillIngests() {
        for (String title : new String[] {null, "   ", "x".repeat(121)}) {
            ai.nextExtract = new IngestPayload(title, payloadOf(1).concepts());
            Material m = service.ingest(1L, "week1.pdf", PDF);
            assertEquals(MaterialStatus.INGESTED, m.status);
            assertNull(m.title);
        }
        assertEquals(3, ai.extractCalls);
    }

    @Test
    void aTitleOfExactlyOneHundredTwentyCharactersIsKept() {
        String title = "y".repeat(120);
        ai.nextExtract = new IngestPayload(title, payloadOf(1).concepts());
        assertEquals(title, service.ingest(1L, "week1.pdf", PDF).title);
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
    void aDeclinedOrCutOffDeckIsNotPaidForTwice() {
        ai.nextError = new AiAnswerException("Claude declined to extract questions from this lecture");
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("declined"));
        assertEquals(1, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void invalidQuestionTypeRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload bad = new QuestionPayload("multiple_choice", "How many steps in the TCP handshake?",
            List.of("1", "2", "3", "4"), 2, null, null, List.of(3), null, null, null);
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
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
        ai.nextExtract = new IngestPayload(null, List.of());
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("no concepts"));
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void conceptWithNoQuestionsRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
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
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
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
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
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
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
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

    // --- an upload that is not a PDF is turned into one, or refused before it costs a call ---

    @Test
    void aPowerPointIsReadAsOnePagePerSlideAndIngested() throws IOException {
        byte[] deck = LectureFileTest.pptx("Intro", "Agenda", "SYN and SYN-ACK", "ACK");
        ai.nextExtract = FakeAiClient.samplePayload();   // cites slides 3 and 4
        Material m = service.ingest(1L, "climate-lecture.pptx", deck);
        assertEquals(MaterialStatus.INGESTED, m.status);
        assertEquals("climate-lecture.pptx", m.filename);
        assertEquals(4, m.pageCount);
        assertEquals(1, ai.extractCalls);
        assertTrue(startsWithPdfMagic(ai.lastExtractPdf), "the provider must be handed a PDF");
    }

    @Test
    void anAcceptedPowerPointKeepsAndQueuesItsPdf() throws IOException {
        when(materialRepo.save(any())).thenAnswer(inv -> {
            Material m = inv.getArgument(0);
            if (m.id == null) m.id = 42L;
            return m;
        });
        Material accepted = service.accept(1L, "week2.pptx", LectureFileTest.pptx("One", "Two"));
        assertEquals(MaterialStatus.PENDING, accepted.status);
        assertEquals(2, accepted.pageCount);
        // the PDF is what is kept for generating more, so that path needs no conversion either
        ArgumentCaptor<MaterialPdf> kept = ArgumentCaptor.forClass(MaterialPdf.class);
        verify(materialPdfRepo).save(kept.capture());
        assertTrue(startsWithPdfMagic(kept.getValue().bytes));
        ArgumentCaptor<IngestRequested> queued = ArgumentCaptor.forClass(IngestRequested.class);
        verify(events).publishEvent(queued.capture());
        assertTrue(startsWithPdfMagic(queued.getValue().pdfBytes()));
    }

    @Test
    void typedNotesAreSetAsPagesAndIngested() {
        ai.nextExtract = payloadCitingPageOne();
        Material m = service.ingest(1L, "notes.md",
            "# Week 1\n\nTCP opens with SYN, SYN-ACK, ACK.".getBytes(StandardCharsets.UTF_8));
        assertEquals(MaterialStatus.INGESTED, m.status);
        assertEquals(1, m.pageCount);
        assertTrue(startsWithPdfMagic(ai.lastExtractPdf));
    }

    @Test
    void aDamagedPowerPointFailsWithoutCallingTheProvider() {
        // the payload is armed so the ingest would succeed on these bytes if the guard let them by
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "climate-lecture.pptx", PPTX);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("PowerPoint"), m.errorMessage);
        assertEquals(0, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
        verify(questionRepo, never()).save(any());
        verify(reviewStateRepo, never()).save(any());
        verify(materialPdfRepo, never()).save(any());
    }

    @Test
    void aFileStudyOsCannotReadFailsWithoutCallingTheProvider() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "lecture-recording.mp4",
            new byte[] {0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0x00});
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("cannot read this kind of file"), m.errorMessage);
        assertEquals(0, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
        verify(questionRepo, never()).save(any());
        verify(reviewStateRepo, never()).save(any());
    }

    @Test
    void reuploadingTheSameRejectedFileReusesItsFailedRow() {
        // this is why the guard sits below the hash lookup: a course holds a file once, so a second
        // upload of the same broken .pptx has to land on the existing FAILED row
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

    // --- several photos sent as one lecture ------------------------------------------------

    @Test
    void photosAreAcceptedAsOneLectureNamedAfterTheNameGiven() throws IOException {
        when(materialRepo.save(any())).thenAnswer(inv -> {
            Material m = inv.getArgument(0);
            if (m.id == null) m.id = 42L;
            return m;
        });
        Material accepted = service.acceptPhotos(1L, "  Week 4 whiteboard ",
            List.of(LectureFileTest.png(400, 200), LectureFileTest.png(200, 400), LectureFileTest.png(300, 300)),
            List.of("IMG_1.png", "IMG_2.png", "IMG_3.png"));
        assertEquals(MaterialStatus.PENDING, accepted.status);
        assertEquals("Week 4 whiteboard.pdf", accepted.filename);
        assertEquals(3, accepted.pageCount);
        assertEquals(0, ai.extractCalls);
        ArgumentCaptor<MaterialPdf> kept = ArgumentCaptor.forClass(MaterialPdf.class);
        verify(materialPdfRepo).save(kept.capture());
        assertTrue(startsWithPdfMagic(kept.getValue().bytes));
        ArgumentCaptor<IngestRequested> queued = ArgumentCaptor.forClass(IngestRequested.class);
        verify(events).publishEvent(queued.capture());
        assertEquals(42L, queued.getValue().materialId());
    }

    @Test
    void aLectureNameThatAlreadyEndsInPdfIsKeptAsItIs() {
        assertEquals("Board.PDF", IngestService.photosFilename("Board.PDF"));
        assertEquals("Lab 2.pdf", IngestService.photosFilename(" Lab 2 "));
    }

    @Test
    void theSameSetOfPhotosSentAgainIsRecognizedAndADifferentOrderIsNot() throws IOException {
        byte[] first = LectureFileTest.png(40, 20);
        byte[] second = LectureFileTest.png(20, 40);
        String once = IngestService.sha256(List.of(first, second));
        assertEquals(once, IngestService.sha256(List.of(first.clone(), second.clone())));
        assertNotEquals(once, IngestService.sha256(List.of(second, first)));

        // and the lookup uses that hash, so a set already ingested costs nothing the second time
        Material existing = new Material();
        existing.id = 7L;
        existing.status = MaterialStatus.INGESTED;
        when(materialRepo.findByCourseIdAndFileHash(1L, once)).thenReturn(Optional.of(existing));
        when(materialPdfRepo.findById(7L)).thenReturn(Optional.of(new MaterialPdf()));
        Material again = service.acceptPhotos(1L, "Board", List.of(first, second), List.of("a.png", "b.png"));
        assertSame(existing, again);
        verify(events, never()).publishEvent(any());
    }

    @Test
    void theSetsHashCannotBeMatchedBySplittingTheSameBytesDifferently() {
        byte[] ab = {1, 2};
        assertNotEquals(IngestService.sha256(List.of(ab, new byte[] {3})),
            IngestService.sha256(List.of(new byte[] {1}, new byte[] {2, 3})));
    }

    @Test
    void aPhotoSetNeverReplacesALectureThatSharesItsName() throws IOException {
        // two whiteboard sets on one day both offered "Photos, Nov 20": the second must not delete
        // the first lecture and its study history, whether it is finished or still being read
        for (MaterialStatus status : List.of(MaterialStatus.INGESTED, MaterialStatus.PENDING)) {
            Material first = new Material();
            first.id = 5L;
            first.course = course;
            first.filename = "Photos, Nov 20.pdf";
            first.fileHash = "the first set's hash";
            first.status = status;
            when(materialRepo.findByCourseIdAndFilename(1L, "Photos, Nov 20.pdf")).thenReturn(List.of(first));

            var refused = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> service.acceptPhotos(1L, "Photos, Nov 20",
                    List.of(LectureFileTest.png(40, 20), LectureFileTest.png(20, 40)), List.of("a.png", "b.png")));
            assertEquals(400, refused.getStatusCode().value());
            assertTrue(refused.getReason().contains("already has a lecture called \"Photos, Nov 20\""),
                refused.getReason());
        }
        verify(materialRepo, never()).delete(any());
        verify(conceptRepo, never()).deleteByMaterialId(any());
        verify(materialRepo, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    void aTypedNameMatchingAnUploadedFileIsRefusedToo() throws IOException {
        Material deck = new Material();
        deck.id = 6L;
        deck.filename = "Week 4.pdf";
        deck.fileHash = "the deck's hash";
        deck.status = MaterialStatus.INGESTED;
        when(materialRepo.findByCourseIdAndFilename(1L, "Week 4.pdf")).thenReturn(List.of(deck));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> service.acceptPhotos(1L, "Week 4", List.of(LectureFileTest.png(40, 20), LectureFileTest.png(20, 40)),
                List.of("a.png", "b.png")));
        verify(materialRepo, never()).delete(any());
    }

    @Test
    void aFailedLectureOfTheSameNameIsReplacedByTheCorrectedSet() throws IOException {
        Material failed = new Material();
        failed.id = 9L;
        failed.course = course;
        failed.filename = "Week 4.pdf";
        failed.fileHash = "the failed set's hash";
        failed.status = MaterialStatus.FAILED;
        when(materialRepo.findByCourseIdAndFilename(1L, "Week 4.pdf")).thenReturn(List.of(failed));
        Material accepted = service.acceptPhotos(1L, "Week 4",
            List.of(LectureFileTest.png(40, 20), LectureFileTest.png(20, 40)), List.of("a.png", "b.png"));
        assertEquals(MaterialStatus.PENDING, accepted.status);
        verify(materialRepo).delete(failed);
    }

    @Test
    void aFileInThePhotoSetThatIsNotAPictureFailsTheLectureAndNamesTheFile() throws IOException {
        Material m = service.acceptPhotos(1L, "Week 4", List.of(LectureFileTest.png(40, 20),
            "Typed notes, not a photo.".getBytes(StandardCharsets.UTF_8)), List.of("IMG_1.png", "notes.txt"));
        assertEquals(MaterialStatus.FAILED, m.status);
        assertEquals("Week 4.pdf", m.filename);
        assertTrue(m.errorMessage.contains("notes.txt"), m.errorMessage);
        assertTrue(m.errorMessage.contains("send the photos again"), m.errorMessage);
        assertEquals(0, ai.extractCalls);
        verify(events, never()).publishEvent(any());
        verify(materialPdfRepo, never()).save(any());
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
        return new IngestPayload(null, List.of(new ConceptPayload(
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
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
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
        assertEquals(4, lecture.pageCount);
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
        assertEquals(4, accepted.pageCount);
        ArgumentCaptor<MaterialPdf> pdf = ArgumentCaptor.forClass(MaterialPdf.class);
        verify(materialPdfRepo).save(pdf.capture());
        assertEquals(42L, pdf.getValue().materialId);
        assertArrayEquals(PDF, pdf.getValue().bytes);
    }

    @Test
    void citedSlidePastTheDeckRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        QuestionPayload cited = good.questions().get(0);
        QuestionPayload pastTheDeck = new QuestionPayload(cited.type(), cited.prompt(), cited.options(),
            cited.correctIndex(), cited.modelAnswer(), cited.rubric(), List.of(5),
            cited.explanation(), cited.optionExplanations(), cited.diagram());
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
            good.name(), good.summary(), good.sourcePages(), List.of(pastTheDeck, good.questions().get(1)))));
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("slide 5"), m.errorMessage);
        assertTrue(m.errorMessage.contains("4 pages"), m.errorMessage);
        assertEquals(4, m.pageCount);
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void conceptSlidePastTheDeckRetriesOnceThenFails() {
        ConceptPayload good = FakeAiClient.samplePayload().concepts().get(0);
        ai.nextExtract = new IngestPayload(null, List.of(new ConceptPayload(
            good.name(), good.summary(), List.of(0), good.questions())));
        Material m = service.ingest(1L, "week1.pdf", PDF);
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("slide 0"), m.errorMessage);
        assertEquals(2, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
    }

    @Test
    void unreadablePdfFailsBeforeTheProvider() {
        ai.nextExtract = FakeAiClient.samplePayload();
        Material m = service.ingest(1L, "week1.pdf",
            "%PDF-1.7\nnot a real document".getBytes(StandardCharsets.UTF_8));
        assertEquals(MaterialStatus.FAILED, m.status);
        assertTrue(m.errorMessage.contains("page count"), m.errorMessage);
        assertEquals(0, ai.extractCalls);
        verify(conceptRepo, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    void generateMoreDoesNotRetryADeclinedRequest() {
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
        MaterialPdf pdf = new MaterialPdf();
        pdf.materialId = 11L;
        pdf.bytes = PDF;
        when(materialPdfRepo.findById(11L)).thenReturn(Optional.of(pdf));
        ai.nextError = new AiAnswerException("Claude declined to extract questions from this lecture");

        assertThrows(AiAnswerException.class, () -> service.generateMore(1L, List.of(5L), 1, "MC"));
        assertEquals(1, ai.generateCalls);
        verify(questionRepo, never()).save(any());
    }

    @Test
    void generateMoreRejectsACitedSlidePastTheDeck() {
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
        MaterialPdf pdf = new MaterialPdf();
        pdf.materialId = 11L;
        pdf.bytes = PDF;
        when(materialPdfRepo.findById(11L)).thenReturn(Optional.of(pdf));
        ai.nextGenerate = new GeneratePayload(List.of(new GeneratedQuestionPayload(
            5L, "MC", "What opens a TCP connection?", List.of("FIN", "SYN"), 1, null, null, List.of(9),
            null, null, null)));

        AiException err = assertThrows(AiException.class,
            () -> service.generateMore(1L, List.of(5L), 1, "MC"));
        assertTrue(err.getMessage().contains("slide 9"), err.getMessage());
        assertTrue(err.getMessage().contains("4 pages"), err.getMessage());
        assertEquals(2, ai.generateCalls);
        verify(questionRepo, never()).save(any());
        assertEquals(4, lecture.pageCount);
    }

    private static boolean startsWithPdfMagic(byte[] bytes) {
        return bytes != null && bytes.length > 5
            && new String(bytes, 0, 5, StandardCharsets.ISO_8859_1).equals("%PDF-");
    }

    /** The sample payload with every citation moved to page 1, for a one-page upload. */
    private static IngestPayload payloadCitingPageOne() {
        ConceptPayload sample = FakeAiClient.samplePayload().concepts().get(0);
        List<QuestionPayload> questions = sample.questions().stream()
            .map(q -> new QuestionPayload(q.type(), q.prompt(), q.options(), q.correctIndex(), q.modelAnswer(),
                q.rubric(), List.of(1), q.explanation(), q.optionExplanations(), q.diagram()))
            .toList();
        return new IngestPayload(null, List.of(
            new ConceptPayload(sample.name(), sample.summary(), List.of(1), questions)));
    }

    @Test
    void countsConceptsWithFewerQuestionsThanExtractionAsksFor() {
        ConceptPayload sample = FakeAiClient.samplePayload().concepts().get(0);
        List<QuestionPayload> three = new ArrayList<>(sample.questions());
        three.add(sample.questions().get(0));
        List<QuestionPayload> four = new ArrayList<>(sample.questions());
        four.addAll(sample.questions());
        IngestPayload payload = new IngestPayload(null, List.of(
            new ConceptPayload("two", sample.summary(), sample.sourcePages(), sample.questions()),
            new ConceptPayload("three", sample.summary(), sample.sourcePages(), three),
            new ConceptPayload("four", sample.summary(), sample.sourcePages(), four)));

        assertEquals(2, IngestService.thinConcepts(payload));
    }

    private static byte[] pdfWithPages(int pages) {
        try (PDDocument doc = new PDDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) doc.addPage(new PDPage());
            doc.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }
}
