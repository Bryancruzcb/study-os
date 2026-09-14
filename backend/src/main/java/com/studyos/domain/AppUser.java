package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.Instant;

/** Someone who signs in. Every course belongs to one account, and no account sees another's courses. */
@Entity
// "user" is a reserved word in Postgres
@Table(name = "app_user")
public class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    // kept trimmed and lowercased, so "Bryan" and "bryan" are one account
    @Column(unique = true, nullable = false)
    public String username;
    @JsonIgnore
    @Column(nullable = false)
    public String passwordHash;
    @Column(nullable = false)
    public Instant createdAt;
}
