package com.studyos.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
public class Question {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @ManyToOne(optional = false)
    @JsonIgnore
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
    // why the key is right and every other answer wrong, drawn from the lecture slides; null on a
    // question nobody has explained yet
    @Column(length = 4000)
    public String explanation;
    @Column(length = 8000)
    public String optionExplanationsJson; // JSON array of strings in option order, MC only
    @Column(length = 4000)
    public String diagram;                // Mermaid source, when a picture makes the answer clearer
    @Enumerated(EnumType.STRING)
    public QuestionStatus status = QuestionStatus.ACTIVE;
    // eval labels (Task 17)
    public Boolean labelAnswerable;
    public Boolean labelCorrectAnswer;
    public Boolean labelUnambiguous;
}
