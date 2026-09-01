package com.studyos.ai;

import java.util.List;

public record ConceptPayload(String name, String summary, List<Integer> sourcePages, List<QuestionPayload> questions) {}
