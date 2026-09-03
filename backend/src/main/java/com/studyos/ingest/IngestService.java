package com.studyos.ingest;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.ai.AiClient;
import com.studyos.ai.AiException;
import com.studyos.ai.ConceptPayload;
import com.studyos.ai.IngestPayload;
import com.studyos.ai.QuestionPayload;
import com.studyos.domain.*;
import com.studyos.repo.*;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IngestService {
    private final CourseRepo courseRepo;
    private final MaterialRepo materialRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final AiClient ai;
    private final Clock clock;
    private final ObjectMapper mapper = new ObjectMapper();
    // matches @Column(length = 2000) on Material.errorMessage
    private static final int ERROR_MESSAGE_MAX = 2000;
    private static final String TRUNCATION_MARKER = " ...[truncated]";

    public IngestService(CourseRepo courseRepo, MaterialRepo materialRepo, ConceptRepo conceptRepo,
                         QuestionRepo questionRepo, ReviewStateRepo reviewStateRepo, AiClient ai, Clock clock) {
        this.courseRepo = courseRepo;
        this.materialRepo = materialRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.ai = ai;
        this.clock = clock;
    }

    @Transactional
    public Material ingest(Long courseId, String filename, byte[] pdfBytes) {
        String hash = sha256(pdfBytes);
        var existing = materialRepo.findByFileHash(hash);
        if (existing.isPresent() && existing.get().status != MaterialStatus.FAILED) return existing.get();

        Course course = courseRepo.findById(courseId).orElseThrow();
        Material material;
        if (existing.isPresent()) {
            // fileHash is unique and there is no retry endpoint, so a FAILED row would block this
            // PDF forever. Reuse it (it has no concepts) and run the pipeline again. The row must
            // describe the upload that succeeds, so it takes this call's course and filename, the
            // same course every new Concept is attached to below.
            material = existing.get();
            material.course = course;
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

        IngestPayload payload;
        try {
            payload = extractWithOneRetry(pdfBytes, course.name);
        } catch (AiException e) {
            material.status = MaterialStatus.FAILED;
            material.errorMessage = truncateForColumn(e.getMessage());
            return materialRepo.save(material);
        }

        LocalDate today = LocalDate.now(clock);
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
                questionRepo.save(q);
            }
            reviewStateRepo.save(ReviewState.initial(concept, today));
        }
        material.status = MaterialStatus.INGESTED;
        return materialRepo.save(material);
    }

    // Material.errorMessage is a varchar(2000). save() on a managed entity only marks it, so an
    // oversized message throws at flush after ingest() has returned, outside the catch, and rolls
    // the transaction back: the user gets a 500 and no FAILED row at all. Truncate at assignment
    // so the row the spec promises always survives, and say so in the message that is kept.
    private static String truncateForColumn(String message) {
        if (message.length() <= ERROR_MESSAGE_MAX) return message;
        return message.substring(0, ERROR_MESSAGE_MAX - TRUNCATION_MARKER.length()) + TRUNCATION_MARKER;
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

    private String joinPages(ConceptPayload cp) {
        return cp.sourcePages() == null ? null
            : cp.sourcePages().stream().map(String::valueOf).collect(Collectors.joining(","));
    }

    private String writeJson(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new AiException("could not serialize question options: " + e.getMessage(), e);
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
