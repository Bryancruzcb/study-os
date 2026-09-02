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
import java.util.HexFormat;
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
        if (existing.isPresent()) return existing.get();

        Course course = courseRepo.findById(courseId).orElseThrow();
        Material material = new Material();
        material.course = course;
        material.filename = filename;
        material.fileHash = hash;
        material = materialRepo.save(material);

        IngestPayload payload;
        try {
            payload = extractWithOneRetry(pdfBytes, course.name);
        } catch (AiException e) {
            material.status = MaterialStatus.FAILED;
            material.errorMessage = e.getMessage();
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

    private IngestPayload extractWithOneRetry(byte[] pdfBytes, String courseName) {
        try {
            return ai.extract(pdfBytes, courseName);
        } catch (AiException first) {
            return ai.extract(pdfBytes, courseName);
        }
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
