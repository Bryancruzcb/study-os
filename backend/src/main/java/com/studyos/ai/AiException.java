package com.studyos.ai;

public class AiException extends RuntimeException {
    public AiException(String message, Throwable cause) { super(message, cause); }
    public AiException(String message) { super(message); }
}
