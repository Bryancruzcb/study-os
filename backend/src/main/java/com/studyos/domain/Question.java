package com.studyos.domain;

import jakarta.persistence.*;

@Entity
public class Question {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(optional = false)
    public Concept concept;
    @Enumerated(EnumType.STRING)
    public QuestionType type;
    @Column(length = 4000)
    public String prompt;
    @Column(length = 4000)
    public String optionsJson;   // JSON array of strings, MC only
    public Integer correctIndex; // MC only
    @Column(length = 4000)
    public String modelAnswer;   // short answer only
    @Column(length = 4000)
    public String rubric;        // short answer only
    public String sourcePages;
    @Enumerated(EnumType.STRING)
    public QuestionStatus status = QuestionStatus.ACTIVE;
    // eval labels (Task 17)
    public Boolean labelAnswerable;
    public Boolean labelCorrectAnswer;
    public Boolean labelUnambiguous;
}
