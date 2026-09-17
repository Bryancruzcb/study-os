package com.studyos.ingest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Runs extraction after the upload transaction commits, so the client can poll PENDING
 * without waiting on the model. Failures that escape process() still land as FAILED.
 */
@Component
public class IngestListener {
    private static final Logger log = LoggerFactory.getLogger(IngestListener.class);
    private final IngestService ingestService;

    public IngestListener(IngestService ingestService) {
        this.ingestService = ingestService;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onIngestRequested(IngestRequested event) {
        try {
            ingestService.process(event.materialId(), event.pdfBytes());
        } catch (Exception e) {
            log.error("ingest failed for material {}", event.materialId(), e);
            ingestService.fail(event.materialId(),
                e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }
}
