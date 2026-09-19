package com.studyos.ingest;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.ai.AiClient;
import com.studyos.ai.AiException;
import com.studyos.ai.ConceptFocus;
import com.studyos.ai.ConceptPayload;
import com.studyos.ai.GeneratePayload;
import com.studyos.ai.GeneratedQuestionPayload;
import com.studyos.ai.IngestPayload;
import com.studyos.ai.QuestionPayload;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.studyos.config.AppStudyProps;
import com.studyos.domain.*;
import com.studyos.exam.ExamPlanner;
import com.studyos.repo.*;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IngestService {
    private final CourseRepo courseRepo;
    private final MaterialRepo materialRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final AttemptRepo attemptRepo;
    private final ExamRepo examRepo;
    private final MaterialPdfRepo materialPdfRepo;
    private final AiClient ai;
    private final Clock clock;
    private final AppStudyProps study;
    private final ExamPlanner examPlanner;
    private final ApplicationEventPublisher events;
    private final ObjectMapper mapper = new ObjectMapper();
    // matches @Column(length = 2000) on Material.errorMessage
    private static final int ERROR_MESSAGE_MAX = 2000;
    private static final String TRUNCATION_MARKER = " ...[truncated]";
    // match the @Column lengths of Question's explanation fields
    private static final int EXPLANATION_MAX = 4000;
    private static final int OPTION_EXPLANATIONS_MAX = 8000;
    private static final int DIAGRAM_MAX = 4000;
    // the diagram kinds the quiz page draws; anything else, or one carrying an init directive, a
    // click handler or a link, is left off instead of being handed to mermaid
    private static final Pattern DIAGRAM_HEADER =
        Pattern.compile("(?:(?:flowchart|graph)\\s+(?:TD|TB|LR|RL|BT)|sequenceDiagram|stateDiagram-v2)\\s*");
    private static final Pattern DIAGRAM_BANNED =
        Pattern.compile("%%\\{|\\bclick\\b|<script|href|javascript:", Pattern.CASE_INSENSITIVE);
    private static final byte[] PDF_MAGIC = {'%', 'P', 'D', 'F', '-'};
    private static final byte[] ZIP_MAGIC = {'P', 'K', 0x03, 0x04};

    public IngestService(CourseRepo courseRepo, MaterialRepo materialRepo, ConceptRepo conceptRepo,
                         QuestionRepo questionRepo, ReviewStateRepo reviewStateRepo, AttemptRepo attemptRepo,
                         ExamRepo examRepo, MaterialPdfRepo materialPdfRepo, AiClient ai, Clock clock,
                         AppStudyProps study, ExamPlanner examPlanner, ApplicationEventPublisher events) {
        this.courseRepo = courseRepo;
        this.materialRepo = materialRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.attemptRepo = attemptRepo;
        this.examRepo = examRepo;
        this.materialPdfRepo = materialPdfRepo;
        this.ai = ai;
        this.clock = clock;
        this.study = study;
        this.examPlanner = examPlanner;
        this.events = events;
    }

    /**
     * Full sync ingest for tests and callers that want the finished Material in one shot.
     * The HTTP upload path uses {@link #accept} so extraction can finish in the background.
     */
    @Transactional
    public Material ingest(Long courseId, String filename, byte[] pdfBytes) {
        Prepared prepared = prepare(courseId, filename, pdfBytes);
        if (prepared.next() != Next.RUN) return prepared.material();
        return complete(prepared.material(), pdfBytes);
    }

    /**
     * Accept an upload: create or reuse a Material, refuse non-PDFs immediately, and when
     * extraction is needed publish {@link IngestRequested} after commit so the request returns PENDING.
     */
    @Transactional
    public Material accept(Long courseId, String filename, byte[] pdfBytes) {
        Prepared prepared = prepare(courseId, filename, pdfBytes);
        if (prepared.next() == Next.RUN) {
            events.publishEvent(new IngestRequested(prepared.material().id, pdfBytes));
        }
        return prepared.material();
    }

    /** Finish a PENDING material: extract, persist the bank, mark INGESTED or FAILED. */
    @Transactional
    public Material process(Long materialId, byte[] pdfBytes) {
        Material material = materialRepo.findById(materialId).orElse(null);
        // deleted/replaced while this job was queued, or already finished elsewhere
        if (material == null || material.status != MaterialStatus.PENDING) return material;
        return complete(material, pdfBytes);
    }

    /** Last-resort FAILED write when background work throws outside the AiException path. */
    @Transactional
    public void fail(Long materialId, String message) {
        Material material = materialRepo.findById(materialId).orElse(null);
        if (material == null || material.status != MaterialStatus.PENDING) return;
        material.status = MaterialStatus.FAILED;
        material.errorMessage = truncateForColumn(message == null ? "ingest failed" : message);
        materialRepo.save(material);
    }

    private enum Next { DONE, RUN }

    private record Prepared(Material material, Next next) {}

    // Hash lookup, FAILED reuse, PDF guard. RUN means extraction still has to happen on this row.
    private Prepared prepare(Long courseId, String filename, byte[] pdfBytes) {
        String hash = sha256(pdfBytes);
        var existing = materialRepo.findByCourseIdAndFileHash(courseId, hash);
        // INGESTED is a no-op; PENDING is already being worked, so do not start a second job
        if (existing.isPresent() && existing.get().status != MaterialStatus.FAILED) {
            Material kept = existing.get();
            // older lectures may lack stored bytes; a re-upload of the same PDF fills them in
            if (materialPdfRepo.findById(kept.id).isEmpty()) {
                keepPdf(kept.id, pdfBytes);
            }
            return new Prepared(kept, Next.DONE);
        }

        // an updated PDF usually keeps its name: drop every other copy of that name in the course
        // so re-upload replaces instead of leaving a second lecture beside the first
        for (Material prior : materialRepo.findByCourseIdAndFilename(courseId, filename)) {
            if (existing.isPresent() && prior.id.equals(existing.get().id)) continue;
            removeLecture(prior);
        }

        Course course = courseRepo.findById(courseId).orElseThrow();
        Material material;
        if (existing.isPresent()) {
            // a course holds a file once and there is no retry endpoint, so a FAILED row would block
            // this PDF in its course forever. Reuse it (it has no concepts) and run the pipeline again,
            // under the filename this upload came with.
            material = existing.get();
            material.filename = filename;
            material.status = MaterialStatus.PENDING;
            material.errorMessage = null;
        } else {
            material = new Material();
            material.course = course;
            material.filename = filename;
            material.fileHash = hash;
        }
        material = materialRepo.save(material);
        if (material.id != null) keepPdf(material.id, pdfBytes);

        // The guard sits below the hash lookup, not above it, so a rejection travels the same
        // FAILED-row contract as a provider failure: the bank page already renders errorMessage,
        // and re-uploading the same bad file reuses this row instead of tripping the course's unique fileHash.
        String notPdf = notPdfMessage(pdfBytes, filename);
        if (notPdf != null) {
            material.status = MaterialStatus.FAILED;
            material.errorMessage = notPdf;
            return new Prepared(materialRepo.save(material), Next.DONE);
        }
        return new Prepared(material, Next.RUN);
    }

    private Material complete(Material material, byte[] pdfBytes) {
        Course course = material.course;
        Long courseId = course.id;
        IngestPayload payload;
        try {
            payload = extractWithOneRetry(pdfBytes, course.name);
        } catch (AiException e) {
            // may have been deleted/replaced while the model ran (skip when id unset — unit mocks)
            if (material.id != null) {
                Material still = materialRepo.findById(material.id).orElse(null);
                if (still == null || still.status != MaterialStatus.PENDING) return still;
                material = still;
            }
            material.status = MaterialStatus.FAILED;
            material.errorMessage = truncateForColumn(e.getMessage());
            return materialRepo.save(material);
        }

        // extraction is slow: delete/replace of this PENDING row may have won the race
        if (material.id != null) {
            Material current = materialRepo.findById(material.id).orElse(null);
            if (current == null || current.status != MaterialStatus.PENDING) return current;
            material = current;
            course = material.course;
            courseId = course.id;
        }

        LocalDate today = LocalDate.now(clock);
        Map<LocalDate, Long> scheduled = scheduledPerDayFrom(courseId, today);
        LocalDate dueDate = today;
        for (ConceptPayload cp : payload.concepts()) {
            Concept concept = new Concept();
            concept.course = course;
            concept.material = material;
            concept.name = cp.name();
            concept.summary = cp.summary();
            concept.sourcePages = joinPages(cp);
            concept = conceptRepo.save(concept);
            for (QuestionPayload qp : cp.questions()) {
                Question q = new Question();
                q.concept = concept;
                q.type = QuestionType.valueOf(qp.type());
                q.prompt = qp.prompt();
                q.optionsJson = qp.options() == null ? null : writeJson(qp.options());
                q.correctIndex = qp.correctIndex();
                q.modelAnswer = qp.modelAnswer();
                q.rubric = qp.rubric();
                q.sourcePages = qp.sourcePages() == null ? null
                    : qp.sourcePages().stream().map(String::valueOf).collect(Collectors.joining(","));
                q.explanation = usableText(qp.explanation(), EXPLANATION_MAX);
                q.optionExplanationsJson = usableOptionExplanations(q.type, qp);
                q.diagram = usableDiagram(qp.diagram());
                questionRepo.save(q);
            }
            // spread the payload forward: a concept goes on the first day from today onwards
            // that is still under the per-course daily cap, and then fills one of its slots
            while (scheduled.getOrDefault(dueDate, 0L) >= study.newConceptsPerDay()) {
                dueDate = dueDate.plusDays(1);
            }
            reviewStateRepo.save(ReviewState.initial(concept, dueDate));
            scheduled.merge(dueDate, 1L, Long::sum);
        }
        material.status = MaterialStatus.INGESTED;
        Material ingested = materialRepo.save(material);
        // a lecture that arrives before an exam joins it, and the exam's plan takes its topics in
        examPlanner.lectureAdded(ingested);
        return ingested;
    }


    /** Deletes a lecture and everything drawn from it: concepts, questions, attempts, review
     *  states, and its place on any exam. The course is then replanned.
     *  QuizProgress for the course is left alone: its orderJson/answersJson may still name
     *  question ids that no longer exist; the quiz UI already has to tolerate missing ids. */
    @Transactional
    public void deleteLecture(Long materialId) {
        Material lecture = materialRepo.findById(materialId).orElseThrow();
        Long courseId = lecture.course.id;
        removeLecture(lecture);
        examPlanner.replan(courseId);
    }

    // drops the lecture's graph and its exam covers; the caller replans when the course still exists
    private void removeLecture(Material lecture) {
        Long materialId = lecture.id;
        for (Exam exam : examRepo.findByLectureId(materialId)) {
            exam.lectures.removeIf(m -> m.id.equals(materialId));
            examRepo.save(exam);
        }
        // FK order: attempts -> questions -> review states -> concepts -> material
        attemptRepo.deleteByQuestionConceptMaterialId(materialId);
        questionRepo.deleteByConceptMaterialId(materialId);
        reviewStateRepo.deleteByConceptMaterialId(materialId);
        conceptRepo.deleteByMaterialId(materialId);
        materialPdfRepo.deleteByMaterialId(materialId);
        materialRepo.delete(lecture);
    }

    // What the course already has booked on every day from `from` onwards, in one read. Days
    // before `from` are left out on purpose: an overdue concept is not due on any future day,
    // so it must not consume a slot the calendar still has free.
    private Map<LocalDate, Long> scheduledPerDayFrom(Long courseId, LocalDate from) {
        Map<LocalDate, Long> perDay = new HashMap<>();
        for (var count : reviewStateRepo
                .findDueDateCountsByConceptCourseIdAndDueDateGreaterThanEqual(courseId, from)) {
            perDay.put(count.getDueDate(), count.getTotal());
        }
        return perDay;
    }

    // Material.errorMessage is a varchar(2000). save() on a managed entity only marks it, so an
    // oversized message throws at flush after ingest() has returned, outside the catch, and rolls
    // the transaction back: the user gets a 500 and no FAILED row at all. Truncate at assignment
    // so the row the spec promises always survives, and say so in the message that is kept.
    private static String truncateForColumn(String message) {
        if (message.length() <= ERROR_MESSAGE_MAX) return message;
        return message.substring(0, ERROR_MESSAGE_MAX - TRUNCATION_MARKER.length()) + TRUNCATION_MARKER;
    }

    // The upload goes to the provider as a PDF document block, so anything else costs a billed
    // call and comes back as an opaque provider error. The bytes decide and the extension does
    // not: a .pptx renamed to .pdf is exactly the upload this has to catch. Null means it is a PDF.
    private static String notPdfMessage(byte[] bytes, String filename) {
        if (startsWith(bytes, PDF_MAGIC)) return null;
        if (startsWith(bytes, ZIP_MAGIC)) {
            return "This looks like " + officeKind(filename) + ", not a PDF. Open it, Save As or "
                + "Export to PDF, and upload that.";
        }
        return "This file is not a PDF. Study OS reads PDFs only, so export or print it to PDF "
            + "and upload that.";
    }

    // The ZIP bytes already prove it is an Office file; the extension only names which one, and
    // falls back to the family so the sentence still tells him what to do.
    private static String officeKind(String filename) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (name.endsWith(".pptx")) return "a PowerPoint file";
        if (name.endsWith(".docx")) return "a Word file";
        if (name.endsWith(".xlsx")) return "an Excel file";
        return "a PowerPoint or other Office file";
    }

    private static boolean startsWith(byte[] bytes, byte[] magic) {
        if (bytes == null || bytes.length < magic.length) return false;
        return Arrays.equals(bytes, 0, magic.length, magic, 0, magic.length);
    }

    private IngestPayload extractWithOneRetry(byte[] pdfBytes, String courseName) {
        try {
            return validate(ai.extract(pdfBytes, courseName));
        } catch (AiException first) {
            return validate(ai.extract(pdfBytes, courseName));
        }
    }

    // A payload that passes the provider's schema can still be unmappable (the schema does not
    // constrain question type). Reject it here so it takes the same retry-then-FAILED path as a
    // provider failure instead of escaping the mapping loop and rolling the Material back.
    private static IngestPayload validate(IngestPayload payload) {
        if (payload == null || payload.concepts() == null || payload.concepts().isEmpty()) {
            throw new AiException("extraction returned no concepts");
        }
        for (ConceptPayload cp : payload.concepts()) {
            if (cp.questions() == null || cp.questions().isEmpty()) {
                throw new AiException("concept has no questions: " + cp.name());
            }
            for (QuestionPayload qp : cp.questions()) {
                if (!isQuestionType(qp.type())) {
                    throw new AiException("invalid question type: " + qp.type());
                }
                validateFieldsForType(qp);
            }
        }
        return payload;
    }

    private static boolean isQuestionType(String type) {
        return type != null && Arrays.stream(QuestionType.values()).anyMatch(t -> t.name().equals(type));
    }

    // The schema marks every type-specific field nullable, so a well-typed question can still be
    // missing what its type needs to be asked or graded. Extra fields on the other type are fine.
    private static void validateFieldsForType(QuestionPayload qp) {
        switch (QuestionType.valueOf(qp.type())) {
            case MC -> {
                List<String> options = qp.options();
                if (options == null || options.size() < 2
                        || options.stream().anyMatch(o -> o == null || o.isBlank())) {
                    throw new AiException(describe(qp) + ": MC needs at least 2 non-blank options");
                }
                Integer idx = qp.correctIndex();
                if (idx == null || idx < 0 || idx >= options.size()) {
                    throw new AiException(describe(qp) + ": MC correctIndex must be 0.."
                        + (options.size() - 1) + " but was " + idx);
                }
            }
            case SHORT_ANSWER -> {
                if (isBlank(qp.modelAnswer()) || isBlank(qp.rubric())) {
                    throw new AiException(describe(qp) + ": SHORT_ANSWER needs modelAnswer and rubric");
                }
            }
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String describe(QuestionPayload qp) {
        String prompt = qp.prompt() == null ? "" : qp.prompt();
        if (prompt.length() > 60) prompt = prompt.substring(0, 60) + "...";
        return "question \"" + prompt + "\"";
    }

    // A question's explanations are extras. One that is blank, too long for its column, or out of
    // step with its question is left off, so a single bad note never fails the whole lecture and
    // buys a second paid extraction; the quiz shows the key and the slides without it.
    private static String usableText(String text, int max) {
        if (text == null || text.isBlank()) return null;
        String stripped = text.strip();
        return stripped.length() <= max ? stripped : null;
    }

    private String usableOptionExplanations(QuestionType type, QuestionPayload qp) {
        List<String> notes = qp.optionExplanations();
        if (type != QuestionType.MC || notes == null || qp.options() == null || notes.size() != qp.options().size()
                || notes.stream().anyMatch(n -> n == null || n.isBlank())) {
            return null;
        }
        String json = writeJson(notes.stream().map(String::strip).toList());
        return json.length() <= OPTION_EXPLANATIONS_MAX ? json : null;
    }

    private static String usableDiagram(String diagram) {
        String source = usableText(diagram, DIAGRAM_MAX);
        if (source == null) return null;
        String firstLine = source.lines().findFirst().orElse("").strip();
        return DIAGRAM_HEADER.matcher(firstLine).matches() && !DIAGRAM_BANNED.matcher(source).find() ? source : null;
    }

    private String joinPages(ConceptPayload cp) {
        return cp.sourcePages() == null ? null
            : cp.sourcePages().stream().map(String::valueOf).collect(Collectors.joining(","));
    }

    private String writeJson(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new AiException("could not serialize question fields: " + e.getMessage(), e);
        }
    }


    /**
     * On-demand bank generation: more questions for selected concepts, from each concept's
     * lecture PDF only (same slides-only rule as ingest).
     */
    @Transactional
    public List<Question> generateMore(Long courseId, List<Long> conceptIds, int count, String types) {
        if (conceptIds == null || conceptIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pick at least one concept.");
        }
        if (count < 1 || count > 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ask for between 1 and 20 questions.");
        }
        if (!isGenerateTypes(types)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "types must be MC, SHORT_ANSWER, or BOTH.");
        }
        Course course = courseRepo.findById(courseId).orElseThrow();
        List<Concept> concepts = conceptRepo.findAllById(conceptIds);
        if (concepts.size() != conceptIds.size()
                || concepts.stream().anyMatch(c -> !c.course.id.equals(courseId))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every concept must belong to this course.");
        }

        Map<Long, List<Concept>> byMaterial = concepts.stream()
            .collect(Collectors.groupingBy(c -> c.material.id));
        int totalConcepts = concepts.size();
        int remaining = count;
        List<Long> materialOrder = byMaterial.keySet().stream().sorted().toList();
        List<Question> saved = new java.util.ArrayList<>();
        for (int i = 0; i < materialOrder.size(); i++) {
            Long materialId = materialOrder.get(i);
            List<Concept> group = byMaterial.get(materialId);
            int n = (i == materialOrder.size() - 1)
                ? remaining
                : Math.max(1, (count * group.size()) / totalConcepts);
            if (n > remaining) n = remaining;
            if (n <= 0) continue;
            remaining -= n;
            MaterialPdf pdf = materialPdfRepo.findById(materialId).orElse(null);
            if (pdf == null || pdf.bytes == null || pdf.bytes.length == 0) {
                String name = group.get(0).material.filename;
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Re-upload " + name + " so Study OS can keep the slides for generating more questions.");
            }
            List<ConceptFocus> focus = group.stream()
                .map(c -> new ConceptFocus(c.id, c.name, c.summary, c.sourcePages))
                .toList();
            GeneratePayload payload = generateWithOneRetry(pdf.bytes, course.name, focus, n, types);
            Map<Long, Concept> byId = group.stream().collect(Collectors.toMap(c -> c.id, c -> c));
            for (GeneratedQuestionPayload qp : payload.questions()) {
                Concept concept = byId.get(qp.conceptId());
                if (concept == null) {
                    throw new AiException("generated question for unknown conceptId: " + qp.conceptId());
                }
                if (!isQuestionType(qp.type())) {
                    throw new AiException("invalid question type: " + qp.type());
                }
                validateGeneratedFields(qp);
                Question q = new Question();
                q.concept = concept;
                q.type = QuestionType.valueOf(qp.type());
                q.prompt = qp.prompt();
                q.optionsJson = qp.options() == null ? null : writeJson(qp.options());
                q.correctIndex = qp.correctIndex();
                q.modelAnswer = qp.modelAnswer();
                q.rubric = qp.rubric();
                q.sourcePages = qp.sourcePages() == null ? null
                    : qp.sourcePages().stream().map(String::valueOf).collect(Collectors.joining(","));
                q.explanation = usableText(qp.explanation(), EXPLANATION_MAX);
                q.optionExplanationsJson = usableOptionExplanations(q.type, toQuestionPayload(qp));
                q.diagram = usableDiagram(qp.diagram());
                saved.add(questionRepo.save(q));
            }
        }
        return saved;
    }

    private void keepPdf(Long materialId, byte[] pdfBytes) {
        MaterialPdf row = materialPdfRepo.findById(materialId).orElseGet(MaterialPdf::new);
        row.materialId = materialId;
        row.bytes = pdfBytes;
        materialPdfRepo.save(row);
    }

    private GeneratePayload generateWithOneRetry(byte[] pdfBytes, String courseName,
                                                 List<ConceptFocus> concepts, int count, String types) {
        try {
            return validateGenerate(ai.generateMore(pdfBytes, courseName, concepts, count, types), concepts);
        } catch (AiException first) {
            return validateGenerate(ai.generateMore(pdfBytes, courseName, concepts, count, types), concepts);
        }
    }

    private static GeneratePayload validateGenerate(GeneratePayload payload, List<ConceptFocus> concepts) {
        if (payload == null || payload.questions() == null || payload.questions().isEmpty()) {
            throw new AiException("generation returned no questions");
        }
        var ids = concepts.stream().map(ConceptFocus::id).collect(Collectors.toSet());
        for (GeneratedQuestionPayload qp : payload.questions()) {
            if (qp.conceptId() == null || !ids.contains(qp.conceptId())) {
                throw new AiException("generated question for unknown conceptId: " + qp.conceptId());
            }
            if (!isQuestionType(qp.type())) {
                throw new AiException("invalid question type: " + qp.type());
            }
            validateGeneratedFields(qp);
        }
        return payload;
    }

    private static boolean isGenerateTypes(String types) {
        return "MC".equals(types) || "SHORT_ANSWER".equals(types) || "BOTH".equals(types);
    }

    private static void validateGeneratedFields(GeneratedQuestionPayload qp) {
        validateFieldsForType(toQuestionPayload(qp));
    }

    private static QuestionPayload toQuestionPayload(GeneratedQuestionPayload qp) {
        return new QuestionPayload(qp.type(), qp.prompt(), qp.options(), qp.correctIndex(),
            qp.modelAnswer(), qp.rubric(), qp.sourcePages(), qp.explanation(),
            qp.optionExplanations(), qp.diagram());
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
