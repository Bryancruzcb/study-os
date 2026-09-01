package com.studyos.ai;

import java.util.List;

public record QuestionPayload(String type, String prompt, List<String> options, Integer correctIndex,
                              String modelAnswer, String rubric, List<Integer> sourcePages) {}
