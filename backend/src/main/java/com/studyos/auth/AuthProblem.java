package com.studyos.auth;

import org.springframework.http.HttpStatus;

/** A sign-up or sign-in the server turns down, carrying the sentence the form shows. */
public class AuthProblem extends RuntimeException {
    final HttpStatus status;

    AuthProblem(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }
}
