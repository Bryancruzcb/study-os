package com.studyos.ai;

import java.util.List;

public class FakeAiClient implements AiClient {
    public IngestPayload nextExtract;
    public GradePayload nextGrade;
    public RuntimeException nextError;
    public int extractCalls = 0;

    @Override
    public IngestPayload extract(byte[] pdfBytes, String courseName) {
        extractCalls++;
        if (nextError != null) throw nextError;
        return nextExtract;
    }

    @Override
    public GradePayload grade(String q, String m, String r, String a) {
        if (nextError != null) throw nextError;
        return nextGrade;
    }

    public static IngestPayload samplePayload() {
        return new IngestPayload(List.of(new ConceptPayload(
            "TCP handshake", "Three-way SYN/SYN-ACK/ACK connection setup", List.of(3, 4),
            List.of(
                new QuestionPayload("MC", "How many steps in the TCP handshake?",
                    List.of("1", "2", "3", "4"), 2, null, null, List.of(3)),
                new QuestionPayload("SHORT_ANSWER", "Describe the TCP three-way handshake.",
                    null, null, "SYN, then SYN-ACK, then ACK",
                    "- names all three segments\n- correct order", List.of(3, 4))))));
    }
}
