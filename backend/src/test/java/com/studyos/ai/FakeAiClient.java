package com.studyos.ai;

import java.util.List;

public class FakeAiClient implements AiClient {
    public IngestPayload nextExtract;
    public GeneratePayload nextGenerate;
    public GradePayload nextGrade;
    public RuntimeException nextError;
    public int extractCalls = 0;
    public int generateCalls = 0;

    @Override
    public IngestPayload extract(byte[] pdfBytes, String courseName) {
        extractCalls++;
        if (nextError != null) throw nextError;
        return nextExtract;
    }

    @Override
    public GeneratePayload generateMore(byte[] pdfBytes, String courseName, List<ConceptFocus> concepts,
                                        int count, String types) {
        generateCalls++;
        if (nextError != null) throw nextError;
        return nextGenerate;
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
                    List.of("1", "2", "3", "4"), 2, null, null, List.of(3),
                    "Slide 3 shows SYN, SYN-ACK and ACK before any data moves.",
                    List.of("Slide 3 shows more than one segment.", "Slide 3 adds an ACK after the SYN-ACK.",
                        "SYN, SYN-ACK and ACK are the three segments on slide 3.", "Slide 3 never shows a fourth segment."),
                    "sequenceDiagram\n  Client->>Server: SYN\n  Server->>Client: SYN-ACK\n  Client->>Server: ACK"),
                new QuestionPayload("SHORT_ANSWER", "Describe the TCP three-way handshake.",
                    null, null, "SYN, then SYN-ACK, then ACK",
                    "- names all three segments\n- correct order", List.of(3, 4),
                    "Slides 3 and 4 name the three segments in order; an answer that drops the final ACK misses slide 4.",
                    null, null)))));
    }

    public static GeneratePayload sampleGenerate(long conceptId) {
        return new GeneratePayload(List.of(
            new GeneratedQuestionPayload(conceptId, "MC", "What opens a TCP connection?",
                List.of("FIN", "RST", "SYN", "ACK"), 2, null, null, List.of(3),
                "Slide 3 starts the handshake with SYN.",
                List.of("FIN closes.", "RST aborts.", "SYN opens on slide 3.", "ACK alone is not the open."),
                null)));
    }
}
