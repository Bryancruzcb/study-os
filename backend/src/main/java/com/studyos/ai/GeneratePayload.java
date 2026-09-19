package com.studyos.ai;

import java.util.List;

public record GeneratePayload(List<GeneratedQuestionPayload> questions) {}
