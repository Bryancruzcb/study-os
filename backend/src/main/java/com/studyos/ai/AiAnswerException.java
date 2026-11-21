package com.studyos.ai;

/**
 * The model answered, but with nothing usable for this input: a refusal, a cut-off or an empty
 * answer. The API and the key worked, so this says something about the input, not an outage, and
 * asking again with the same input will most likely fail the same way.
 */
public class AiAnswerException extends AiException {
    public AiAnswerException(String message) { super(message); }
}
