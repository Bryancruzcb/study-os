package com.studyos.ai;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record QuestionPayload(String type, String prompt,
                              @Schema(nullable = true) List<String> options,
                              @Schema(nullable = true) Integer correctIndex,
                              @Schema(nullable = true) String modelAnswer,
                              @Schema(nullable = true) String rubric,
                              List<Integer> sourcePages,
                              @JsonPropertyDescription("Why the keyed answer is right, from these slides only, citing them as 'slide N'")
                              String explanation,
                              @JsonPropertyDescription("MC only: one note per option, in option order, on why the slides make it right or wrong")
                              @Schema(nullable = true) List<String> optionExplanations,
                              @JsonPropertyDescription("Mermaid source when a picture of the slides' structure or flow helps, otherwise null")
                              @Schema(nullable = true) String diagram) {}
