package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

/**
 * The in-progress or finished quiz for one course. One row per course: the course already belongs
 * to one account, so the owner of the course is the owner of the run. A quiz is practice and never
 * records attempts; this only keeps the run so another browser or device can pick it up.
 */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"course_id"}))
public class QuizProgress {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @OneToOne(optional = false)
    @JsonIgnore
    public Course course;
    // question ids in asking order
    @Column(nullable = false, columnDefinition = "TEXT")
    public String orderJson;
    // map of question id to {picked, text, correct}
    @Column(nullable = false, columnDefinition = "TEXT")
    public String answersJson;
    public boolean finished;
}
