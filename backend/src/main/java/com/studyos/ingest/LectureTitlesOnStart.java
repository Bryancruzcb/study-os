package com.studyos.ingest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Names lectures from before titles existed once the app is up. It runs on its own thread, so
 * startup and the host's health check never wait on the model. Each start retries only lectures
 * still untitled: one whose answer was unusable, or that failed, is simply left for the next start.
 */
@Component
public class LectureTitlesOnStart {
    private static final Logger log = LoggerFactory.getLogger(LectureTitlesOnStart.class);
    private final LectureTitles titles;
    private final boolean enabled;

    public LectureTitlesOnStart(LectureTitles titles,
                                @Value("${app.titles.backfill-on-start:true}") boolean enabled) {
        this.titles = titles;
        this.enabled = enabled;
    }

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (!enabled) return;
        try {
            titles.backfill();
        } catch (Exception e) {
            // a title is only a label on screen; nothing here is worth taking the app down for
            log.error("naming untitled lectures failed", e);
        }
    }
}
