package com.studyos.ingest;

/** Fired after a PENDING material is committed, so extraction runs off the upload request. */
public record IngestRequested(Long materialId, byte[] pdfBytes) {
}
