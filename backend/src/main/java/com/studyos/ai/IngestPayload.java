package com.studyos.ai;

import java.util.List;

/**
 * What extraction returns for one lecture: a short title naming its subject, and its concepts.
 * The title is a label, not part of the bank, so a missing or unusable one never fails an ingest.
 */
public record IngestPayload(String title, List<ConceptPayload> concepts) {}
