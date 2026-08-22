package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class RunApiTest extends ApiTestBase {

    /** 300 samples over a window of 60 is five windows, so four boundaries. */
    private static final int WINDOWS = 5;
    private static final int BOUNDARIES = WINDOWS - 1;

    private String createRun() {
        var response = post("/api/v1/runs", createRunBody(), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return (String) response.getBody().get("id");
    }

    private static Map<String, Object> successBody() {
        return Map.of(
                "bestRandIndex", 1.0,
                "clusterCounts", List.of(2, 2, 3, 3, 2),
                "events", Map.of(
                        "stable", List.of(2, 0, 3, 0),
                        "emerging", List.of(0, 1, 0, 0),
                        "drift", List.of(0, 2, 0, 2),
                        "forgetting", List.of(0, 0, 0, 1)));
    }

    // ── creating and reading ────────────────────────────────────────────────

    @Test
    void a_new_run_starts_running_with_its_window_count_derived() {
        var response = post("/api/v1/runs", createRunBody(), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        var run = response.getBody();
        assertThat(run.get("state")).isEqualTo("RUNNING");
        // Derived from samples and window size, never taken from the client: a
        // caller that reported its own total could show a bar reaching 100%
        // having analysed a third of the stream.
        assertThat(run.get("windowsTotal")).isEqualTo(WINDOWS);
        assertThat(run.get("windowsDone")).isEqualTo(0);
    }

    @Test
    void a_run_carries_the_parameters_that_produced_it() {
        var body = createRunBody("parameters", parametersWith("sigma", 3.25));
        var run = post("/api/v1/runs", body, Map.class).getBody();
        var stored = (Map<?, ?>) get("/api/v1/runs/" + run.get("id"), Map.class)
                .getBody().get("parameters");
        assertThat(stored.get("sigma")).isEqualTo(3.25);
    }

    @Test
    void listing_returns_my_runs_newest_first() {
        String older = createRun();
        String newer = createRun();
        var listed = get("/api/v1/runs", List.class).getBody();
        var ids = listed.stream().map(row -> ((Map<?, ?>) row).get("id")).toList();
        assertThat(ids).containsSubsequence(newer, older);
    }

    @Test
    void timestamps_are_iso_8601_strings() {
        // Jackson 3 writes dates this way by default, where Jackson 2 wrote epoch
        // numbers unless told otherwise. Defaults are worth pinning: this is what
        // a client parses and what a person reads in a log, and it would change
        // silently under a library upgrade.
        var run = post("/api/v1/runs", createRunBody(), Map.class).getBody();
        assertThat(run.get("createdAt")).asString()
                .matches("\\d{4}-\\d{2}-\\d{2}T.*");
    }

    // ── ownership ───────────────────────────────────────────────────────────

    @Test
    void another_users_run_is_not_found_rather_than_forbidden() {
        String mine = createRun();
        String stranger = registerFresh().accessToken();

        // 404 and not 403: a 403 confirms the id exists, which is the one thing
        // a stranger guessing ids wants to learn.
        assertThat(as(stranger, HttpMethod.GET, "/api/v1/runs/" + mine, String.class)
                .getStatusCode().value()).isEqualTo(404);
        assertThat(as(stranger, HttpMethod.DELETE, "/api/v1/runs/" + mine, null, String.class)
                .getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void another_user_cannot_report_progress_or_results_on_my_run() {
        String mine = createRun();
        String stranger = registerFresh().accessToken();

        assertThat(as(stranger, HttpMethod.PATCH, "/api/v1/runs/" + mine + "/progress",
                Map.of("windowsDone", 3), String.class).getStatusCode().value()).isEqualTo(404);
        assertThat(as(stranger, HttpMethod.POST, "/api/v1/runs/" + mine + "/result",
                successBody(), String.class).getStatusCode().value()).isEqualTo(404);

        // And mine is untouched by the attempts.
        assertThat(get("/api/v1/runs/" + mine, Map.class).getBody().get("state")).isEqualTo("RUNNING");
    }

    @Test
    void my_listing_does_not_include_another_users_runs() {
        createRun();
        String stranger = registerFresh().accessToken();
        var theirs = as(stranger, HttpMethod.GET, "/api/v1/runs", List.class).getBody();
        assertThat(theirs).isEmpty();
    }

    // ── progress ────────────────────────────────────────────────────────────

    @Test
    void progress_advances() {
        String id = createRun();
        var response = as(token, HttpMethod.PATCH, "/api/v1/runs/" + id + "/progress",
                Map.of("windowsDone", 3), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("windowsDone")).isEqualTo(3);
    }

    @Test
    void progress_does_not_go_backwards() {
        String id = createRun();
        as(token, HttpMethod.PATCH, "/api/v1/runs/" + id + "/progress",
                Map.of("windowsDone", 4), Map.class);

        // Two in-flight reports can arrive out of order; the older one must not
        // make the bar jump back.
        var late = as(token, HttpMethod.PATCH, "/api/v1/runs/" + id + "/progress",
                Map.of("windowsDone", 2), String.class);
        assertThat(late.getStatusCode().value()).isEqualTo(409);
        assertThat(get("/api/v1/runs/" + id, Map.class).getBody().get("windowsDone")).isEqualTo(4);
    }

    @Test
    void progress_beyond_the_window_count_is_refused() {
        String id = createRun();
        assertThat(as(token, HttpMethod.PATCH, "/api/v1/runs/" + id + "/progress",
                Map.of("windowsDone", WINDOWS + 1), String.class).getStatusCode().value())
                .isEqualTo(409);
    }

    @Test
    void a_finished_run_takes_no_more_progress() {
        String id = createRun();
        post("/api/v1/runs/" + id + "/result", successBody(), Map.class);
        assertThat(as(token, HttpMethod.PATCH, "/api/v1/runs/" + id + "/progress",
                Map.of("windowsDone", 5), String.class).getStatusCode().value()).isEqualTo(409);
    }

    // ── results ─────────────────────────────────────────────────────────────

    @Test
    void a_successful_result_completes_the_run() {
        String id = createRun();
        var response = post("/api/v1/runs/" + id + "/result", successBody(), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);

        var run = response.getBody();
        assertThat(run.get("state")).isEqualTo("SUCCEEDED");
        assertThat(run.get("bestRandIndex")).isEqualTo(1.0);
        assertThat(run.get("clusterCounts")).isEqualTo(List.of(2, 2, 3, 3, 2));
        assertThat(run.get("finishedAt")).isNotNull();
        // Completing implies every window was analysed.
        assertThat(run.get("windowsDone")).isEqualTo(WINDOWS);
    }

    @Test
    void a_failure_is_recorded_as_one() {
        String id = createRun();
        var response = post("/api/v1/runs/" + id + "/result",
                Map.of("error", "the browser ran out of memory"), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("state")).isEqualTo("FAILED");
        assertThat(response.getBody().get("error")).isEqualTo("the browser ran out of memory");
    }

    @Test
    void a_result_can_only_be_submitted_once() {
        String id = createRun();
        post("/api/v1/runs/" + id + "/result", successBody(), Map.class);

        // A client that retried after a timeout it could not tell from a failure
        // must not replace a good result with a second one.
        var again = post("/api/v1/runs/" + id + "/result", successBody(), String.class);
        assertThat(again.getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void a_result_claiming_both_success_and_failure_is_refused() {
        String id = createRun();
        var body = new java.util.HashMap<String, Object>(successBody());
        body.put("error", "but also this");
        var response = post("/api/v1/runs/" + id + "/result", body, String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(get("/api/v1/runs/" + id, Map.class).getBody().get("state")).isEqualTo("RUNNING");
    }

    @Test
    void a_result_with_the_wrong_number_of_cluster_counts_is_refused() {
        String id = createRun();
        var body = new java.util.HashMap<String, Object>(successBody());
        body.put("clusterCounts", List.of(2, 2));
        var response = post("/api/v1/runs/" + id + "/result", body, String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody()).contains("5 windows");
    }

    @Test
    void a_result_with_the_wrong_number_of_boundary_events_is_refused() {
        String id = createRun();
        var body = new java.util.HashMap<String, Object>(successBody());
        body.put("events", Map.of("stable", List.of(1, 2, 3)));   // three, not four
        var response = post("/api/v1/runs/" + id + "/result", body, String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody()).contains("boundaries");
    }

    @Test
    void an_incomplete_success_is_refused() {
        String id = createRun();
        var response = post("/api/v1/runs/" + id + "/result",
                Map.of("bestRandIndex", 1.0), String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
    }

    // ── refusals at creation ────────────────────────────────────────────────

    @Test
    void a_window_leaving_fewer_than_two_windows_is_refused() {
        var response = post("/api/v1/runs",
                createRunBody("parameters", parametersWith("windowSize", 200)), String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody()).contains("at least 2");
    }

    @Test
    void parameters_outside_their_range_are_refused_with_the_field_named() {
        record Case(String field, Object value) {
        }
        for (var bad : List.of(
                new Case("neighbourFraction", 2.0),
                new Case("neighbourFraction", 0.0),
                new Case("sigma", -1.0),
                new Case("kernelType", 9),
                new Case("similarityThreshold", 1.5),
                new Case("windowSize", 1))) {
            var response = post("/api/v1/runs",
                    createRunBody("parameters", parametersWith(bad.field(), bad.value())), String.class);
            assertThat(response.getStatusCode().value())
                    .as("%s = %s", bad.field(), bad.value()).isEqualTo(400);
        }
    }

    @Test
    void deleting_removes_the_run() {
        String id = createRun();
        assertThat(as(token, HttpMethod.DELETE, "/api/v1/runs/" + id, null, String.class)
                .getStatusCode().value()).isEqualTo(204);
        assertThat(get("/api/v1/runs/" + id, String.class).getStatusCode().value()).isEqualTo(404);
    }
}
