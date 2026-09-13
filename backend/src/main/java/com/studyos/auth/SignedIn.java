package com.studyos.auth;

import java.io.Serializable;

/** Who a session belongs to. This is what the session stores, so it never carries the password hash. */
public record SignedIn(Long id, String username) implements Serializable {}
