package com.studyos.ai;

public interface AiClient {
    IngestPayload extract(byte[] pdfBytes, String courseName);
    GradePayload grade(String questionPrompt, String modelAnswer, String rubric, String givenAnswer);
}
