package com.studyos;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.studyos.auth.SignedInMvc;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

// a stand-in controller that fails every way a real one can, under the real security rules
@WebMvcTest(ApiErrorsTest.Failing.class)
@Import({SignedInMvc.class, ApiErrorsTest.Failing.class})
class ApiErrorsTest {
    @Autowired MockMvc mvc;

    @RestController
    @RequestMapping("/api/failing")
    static class Failing {
        record Named(@NotBlank(message = "Give the exam a name.") String name) {}
        record Stock(@NotBlank String name) {}

        @GetMapping("/refused")
        Map<String, String> refused() {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pick at least one concept.");
        }

        @GetMapping("/missing")
        Map<String, String> missing() {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        @GetMapping("/conflict")
        Map<String, String> conflict() {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }

        @GetMapping("/broken")
        Map<String, String> broken() {
            throw new IllegalStateException("question 9 has malformed optionsJson at db.internal:5432");
        }

        @GetMapping("/broken-on-purpose")
        Map<String, String> brokenOnPurpose() {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "pool exhausted: 10/10 connections");
        }

        @GetMapping("/too-big")
        Map<String, String> tooBig() {
            throw new MaxUploadSizeExceededException(32L * 1024 * 1024);
        }

        @GetMapping("/needs-a-param")
        Map<String, String> needsAParam(@RequestParam Long courseId) {
            return Map.of("courseId", String.valueOf(courseId));
        }

        @PostMapping("/named")
        Map<String, String> named(@Valid @RequestBody Named body) {
            return Map.of("name", body.name());
        }

        @PostMapping("/stock")
        Map<String, String> stock(@Valid @RequestBody Stock body) {
            return Map.of("name", body.name());
        }
    }

    @Test
    void aRefusalReachesThePageInItsOwnWords() throws Exception {
        mvc.perform(get("/api/failing/refused"))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.error").value("Pick at least one concept."));
    }

    @Test
    void aRefusalWithoutAReasonGetsASentenceForItsStatus() throws Exception {
        mvc.perform(get("/api/failing/missing"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("That isn't there any more. It may have been deleted."));
        mvc.perform(get("/api/failing/conflict"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("That changed while you were working. Reload and try again."));
    }

    @Test
    void anUnexpectedFailureSaysNothingAboutWhatBroke() throws Exception {
        mvc.perform(get("/api/failing/broken"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.error").value(ApiErrors.SERVER_PROBLEM))
            .andExpect(jsonPath("$.trace").doesNotExist())
            .andExpect(content().string(not(containsString("optionsJson"))))
            .andExpect(content().string(not(containsString("IllegalStateException"))));
    }

    @Test
    void aServerErrorThrownOnPurposeStillHidesItsReason() throws Exception {
        mvc.perform(get("/api/failing/broken-on-purpose"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error").value(ApiErrors.SERVER_PROBLEM))
            .andExpect(content().string(not(containsString("pool exhausted"))));
    }

    @Test
    void anUploadOverTheLimitSaysWhatTheLimitIs() throws Exception {
        mvc.perform(get("/api/failing/too-big"))
            .andExpect(status().isPayloadTooLarge())
            .andExpect(jsonPath("$.error").value("That file is too big to upload (the limit is 32 MB)."));
    }

    @Test
    void aMissingParameterOrUnreadableBodyIsAPlainBadRequest() throws Exception {
        mvc.perform(get("/api/failing/needs-a-param"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("That request wasn't valid."));
        mvc.perform(post("/api/failing/named").contentType(MediaType.APPLICATION_JSON).content("{not json"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("That request wasn't valid."));
    }

    @Test
    void aValidationMessageWrittenAsASentenceReachesThePage() throws Exception {
        mvc.perform(post("/api/failing/named").contentType(MediaType.APPLICATION_JSON).content("{\"name\": \" \"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Give the exam a name."));
    }

    @Test
    void aStockValidationMessageIsReplacedWithThePlainSentence() throws Exception {
        mvc.perform(post("/api/failing/stock").contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("That request wasn't valid."));
    }

    @Test
    void onlyACapitalisedMessageWithEndPunctuationCountsAsASentence() {
        assertTrue(ApiErrors.readsAsSentence("Give the exam a name."));
        assertFalse(ApiErrors.readsAsSentence("must not be blank"));
        assertFalse(ApiErrors.readsAsSentence("Must not be blank"));
        assertFalse(ApiErrors.readsAsSentence("  "));
        assertFalse(ApiErrors.readsAsSentence(null));
    }
}
