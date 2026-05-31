package com.cloudops.fraud;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest({FraudController.class, HealthController.class})
class FraudControllerTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void healthzOk() throws Exception {
        mvc.perform(get("/healthz")).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void scoreApprovesSmallOrder() throws Exception {
        mvc.perform(post("/score").contentType(MediaType.APPLICATION_JSON)
                .content("{\"amount_cents\":5000,\"item_count\":1,\"tenant_id\":\"t1\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.decision").value("approve"));
    }

    @Test
    void scoreDeniesLargeOrder() throws Exception {
        mvc.perform(post("/score").contentType(MediaType.APPLICATION_JSON)
                .content("{\"amount_cents\":500000,\"item_count\":25,\"tenant_id\":\"t1\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.decision").value("deny"));
    }

    @Test
    void scoreRejectsNegative() throws Exception {
        mvc.perform(post("/score").contentType(MediaType.APPLICATION_JSON)
                .content("{\"amount_cents\":-1,\"item_count\":1}"))
            .andExpect(status().isBadRequest());
    }
}
