package com.studyos.ingest;

import com.studyos.ai.AiAnswerException;
import com.studyos.ai.AiClient;
import com.studyos.ai.ConceptFocus;
import com.studyos.ai.TitlePayload;
import com.studyos.domain.Concept;
import com.studyos.domain.Material;
import com.studyos.domain.MaterialStatus;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.MaterialRepo;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Names the lectures that were ingested before extraction gave each one a title. The model reads
 * the lecture's concepts rather than its PDF, because an old lecture may have no stored PDF.
 */
@Service
public class LectureTitles {
    private static final Logger log = LoggerFactory.getLogger(LectureTitles.class);
    // Three calls failing in a row means the API is down or the key is missing, so the rest wait
    // for the next start instead of each paying for a doomed call. Only failures of the call
    // itself count: a refusal or a cut-off is about one lecture, and the walk starts from the
    // lowest id every time, so counting those would let a few refused lectures at the front
    // block every later one on every start.
    static final int FAILURES_BEFORE_STOP = 3;

    private final MaterialRepo materialRepo;
    private final ConceptRepo conceptRepo;
    private final AiClient ai;

    public LectureTitles(MaterialRepo materialRepo, ConceptRepo conceptRepo, AiClient ai) {
        this.materialRepo = materialRepo;
        this.conceptRepo = conceptRepo;
        this.ai = ai;
    }

    /**
     * Titles every untitled ingested lecture it can, oldest first, one model call at a time, and
     * returns how many it titled. No transaction spans the calls: each title is its own update.
     */
    public int backfill() {
        List<Material> untitled = materialRepo.findByStatusAndTitleIsNullOrderByIdAsc(MaterialStatus.INGESTED);
        int titled = 0;
        int failuresInARow = 0;
        for (Material lecture : untitled) {
            try {
                if (nameOne(lecture)) titled++;
                failuresInARow = 0;
            } catch (RuntimeException e) {
                log.warn("could not name lecture {}: {}", lecture.id, e.getMessage());
                // A model answer, even an unusable one, shows the API and the key work.
                failuresInARow = isOutage(e) ? failuresInARow + 1 : 0;
                if (failuresInARow >= FAILURES_BEFORE_STOP) {
                    log.warn("stopped naming lectures after {} failures in a row; the rest wait for the next start",
                        failuresInARow);
                    break;
                }
            }
        }
        log.info("named {} of {} untitled lectures", titled, untitled.size());
        return titled;
    }

    // True when the lecture got a title. A lecture with no concepts gives the model nothing to
    // name, and an unusable answer is dropped the way extraction drops one.
    private boolean nameOne(Material lecture) {
        List<ConceptFocus> concepts = focusOf(conceptRepo.findByMaterialIdOrderByIdAsc(lecture.id));
        if (concepts.isEmpty()) return false;
        TitlePayload answer = ai.nameLecture(lecture.course.name, concepts);
        String title = answer == null ? null : IngestService.usableTitle(answer.title());
        if (title == null) return false;
        return materialRepo.setTitleIfMissing(lecture.id, title) == 1;
    }

    // True when the failure is the call's, not the lecture's: a network error, a 401, 429 or 5xx,
    // or anything else that is not the model answering. Those are what the breaker counts.
    static boolean isOutage(RuntimeException e) {
        return !(e instanceof AiAnswerException);
    }

    static List<ConceptFocus> focusOf(List<Concept> concepts) {
        return concepts.stream()
            .map(c -> new ConceptFocus(c.id, c.name, c.summary, c.sourcePages))
            .toList();
    }
}
