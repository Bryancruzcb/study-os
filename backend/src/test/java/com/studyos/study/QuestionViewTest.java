package com.studyos.study;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyos.domain.Concept;
import com.studyos.domain.Material;
import com.studyos.domain.Question;
import com.studyos.domain.QuestionType;
import java.util.List;
import org.junit.jupiter.api.Test;

class QuestionViewTest {
    ObjectMapper mapper = new ObjectMapper();

    private Question mc(String optionsJson) {
        Question q = new Question();
        q.id = 9L;
        q.type = QuestionType.MC;
        q.prompt = "Steps in the TCP handshake?";
        q.optionsJson = optionsJson;
        q.correctIndex = 1;
        q.sourcePages = "3";
        q.concept = new Concept();
        q.concept.id = 4L;
        q.concept.name = "TCP handshake";
        q.concept.material = new Material();
        q.concept.material.id = 7L;
        q.concept.material.filename = "Lecture 3.pdf";
        return q;
    }

    @Test
    void parsesOptionsFromJson() {
        QuestionView v = QuestionView.from(mc("[\"a\",\"b\"]"), mapper);
        assertEquals(9L, v.id());
        assertEquals(4L, v.conceptId());
        assertEquals("TCP handshake", v.topic());
        assertEquals("Lecture 3.pdf", v.lecture());
        assertEquals(7L, v.lectureId());
        assertEquals("MC", v.type());
        assertEquals("Steps in the TCP handshake?", v.prompt());
        assertEquals(List.of("a", "b"), v.options());
        assertEquals("3", v.sourcePages());
    }

    @Test
    void nullOrBlankOptionsJsonGivesEmptyList() {
        assertEquals(List.of(), QuestionView.from(mc(null), mapper).options());
        assertEquals(List.of(), QuestionView.from(mc("  "), mapper).options());
    }
}
