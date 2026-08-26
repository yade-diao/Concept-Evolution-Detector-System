package dev.yade.ced.datasets;

import dev.yade.ced.auth.User;
import jakarta.validation.Valid;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The datasets an account keeps on the server.
 *
 * Optional by design: the browser can read a file, cache it and run on it
 * without any of this. These endpoints exist for the second machine.
 */
@RestController
@RequestMapping("/api/v1/datasets")
public class DatasetController {

    private final DatasetService datasets;

    public DatasetController(DatasetService datasets) {
        this.datasets = datasets;
    }

    @GetMapping
    public List<DatasetDtos.Summary> list(@AuthenticationPrincipal User me) {
        return datasets.list(me).stream().map(DatasetDtos.Summary::of).toList();
    }

    @GetMapping("/usage")
    public DatasetDtos.Usage usage(@AuthenticationPrincipal User me) {
        return datasets.usage(me);
    }

    @PostMapping
    public ResponseEntity<DatasetDtos.Summary> upload(@AuthenticationPrincipal User me,
                                                      @Valid @RequestBody DatasetDtos.Upload body) {
        Dataset saved = datasets.upload(me, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(DatasetDtos.Summary.of(saved));
    }

    @GetMapping("/{id}")
    public DatasetDtos.Content get(@AuthenticationPrincipal User me, @PathVariable UUID id) {
        Dataset dataset = datasets.get(me, id);
        var encoder = Base64.getEncoder();
        return new DatasetDtos.Content(dataset.getId(), dataset.getName(), dataset.getSamples(),
                dataset.getFeatures(), dataset.getClasses(),
                encoder.encodeToString(dataset.getFeaturesBlob()),
                encoder.encodeToString(dataset.getLabelsBlob()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal User me, @PathVariable UUID id) {
        datasets.delete(me, id);
    }
}
