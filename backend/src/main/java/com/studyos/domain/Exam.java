package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

/**
 * A test on a date, covering some of a course's lectures. The schedule paces the topics those
 * lectures produced to the date: the fewer days are left, the more of them each day holds.
 */
@Entity
public class Exam {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(optional = false)
    @JsonIgnore
    public Course course;
    @Column(nullable = false)
    public String name;
    // not "date": a column named after a type is one keyword clash waiting for the next database
    @Column(name = "exam_date", nullable = false)
    public LocalDate date;
    @ManyToMany
    @JoinTable(name = "exam_lecture",
        joinColumns = @JoinColumn(name = "exam_id"),
        inverseJoinColumns = @JoinColumn(name = "material_id"))
    @JsonIgnore
    public Set<Material> lectures = new HashSet<>();
}
