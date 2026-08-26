package dev.yade.ced;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

/**
 * The datasets an account keeps on the server.
 *
 * The quota is set small here so the boundary is reachable in a test; what is
 * being checked is that it exists, that the declared shape has to match the
 * bytes, and that a guest cannot reach any of it - not the number, which is
 * configuration.
 */
@TestPropertySource(properties = "ced.limits.dataset-bytes-per-user=4096")
class DatasetApiTest extends ApiTestBase {

    /** A `samples x features` float64 matrix and its int32 labels, base64. */
    private static Map<String, Object> upload(String name, int samples, int features) {
        byte[] matrix = new byte[samples * features * Double.BYTES];
        byte[] labels = new byte[samples * Integer.BYTES];
        var encoder = Base64.getEncoder();
        return Map.of("name", name, "samples", samples, "features", features, "classes", 2,
                "features64", encoder.encodeToString(matrix),
                "labels64", encoder.encodeToString(labels));
    }

    @Test
    void a_dataset_can_be_uploaded_listed_fetched_and_deleted() {
        ResponseEntity<Map> created = post("/api/v1/datasets", upload("mine", 4, 8), Map.class);
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String id = created.getBody().get("id").toString();

        ResponseEntity<List> listed = get("/api/v1/datasets", List.class);
        assertThat(listed.getBody()).hasSize(1);

        ResponseEntity<Map> fetched = get("/api/v1/datasets/" + id, Map.class);
        assertThat(fetched.getBody().get("features64")).isNotNull();

        assertThat(as(token, HttpMethod.DELETE, "/api/v1/datasets/" + id, Void.class)
                .getStatusCode().value()).isEqualTo(204);
        assertThat(get("/api/v1/datasets", List.class).getBody()).isEmpty();
    }

    // A matrix whose length disagrees with its declared shape would be handed to
    // the algorithm at the wrong width, and would cluster something plausible.
    @Test
    void the_declared_shape_has_to_match_the_bytes() {
        var wrong = new java.util.HashMap<>(upload("wrong", 4, 8));
        wrong.put("features", 9);

        ResponseEntity<Map> refused = post("/api/v1/datasets", wrong, Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(400);
        assertThat(refused.getBody().get("detail").toString()).contains("float64");
    }

    @Test
    void the_quota_is_enforced_against_what_is_stored() {
        // 4 x 100 float64 is 3 200 bytes, so the second one crosses 4 096.
        assertThat(post("/api/v1/datasets", upload("first", 4, 100), Map.class)
                .getStatusCode().value()).isEqualTo(201);

        ResponseEntity<Map> refused = post("/api/v1/datasets", upload("second", 4, 100), Map.class);
        assertThat(refused.getStatusCode().value()).isEqualTo(409);
        assertThat(refused.getBody().get("detail").toString()).contains("left");
    }

    @Test
    void two_datasets_cannot_share_a_name_in_one_account() {
        post("/api/v1/datasets", upload("same", 4, 8), Map.class);
        assertThat(post("/api/v1/datasets", upload("SAME", 4, 8), Map.class)
                .getStatusCode().value()).isEqualTo(409);
    }

    // Storage belongs to accounts. A guest can run the examples and keep runs;
    // 25 MB for anyone who asks, with no address to ask about it, is not an
    // offer this can make.
    @Test
    void a_guest_cannot_reach_the_dataset_store() {
        assertThat(as(guestToken(), HttpMethod.GET, "/api/v1/datasets", Map.class)
                .getStatusCode().value()).isEqualTo(403);
        assertThat(as(guestToken(), HttpMethod.POST, "/api/v1/datasets",
                upload("guest", 4, 8), Map.class).getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void one_account_cannot_see_anothers_datasets() {
        post("/api/v1/datasets", upload("mine", 4, 8), Map.class);
        String other = registerFresh().accessToken();

        assertThat(as(other, HttpMethod.GET, "/api/v1/datasets", List.class).getBody()).isEmpty();
    }
}
