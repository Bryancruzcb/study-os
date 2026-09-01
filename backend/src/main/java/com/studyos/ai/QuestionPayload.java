package com.studyos.ai;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record QuestionPayload(String type, String prompt,
                              @Schema(nullable = true) List<String> options,
                              @Schema(nullable = true) Integer correctIndex,
                              @Schema(nullable = true) String modelAnswer,
                              @Schema(nullable = true) String rubric,
                              List<Integer> sourcePages) {}
