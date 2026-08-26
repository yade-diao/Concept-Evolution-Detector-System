package dev.yade.ced.datasets;

import dev.yade.ced.auth.User;
import dev.yade.ced.common.GlobalExceptionHandler.NotFound;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Uploading, listing and removing the datasets an account owns.
 *
 * The quota is the only interesting rule here, and it is checked against what
 * is actually stored rather than against a running total: a count that drifts
 * from the rows is a quota that either blocks an account with room to spare or
 * lets one past that has none.
 *
 * Nothing is computed on these bytes. The server holds them so the same file is
 * there from another machine; the clustering happens in the browser either way.
 */
@Service
public class DatasetService {

    private final DatasetRepository datasets;
    private final long quotaBytes;

    public DatasetService(DatasetRepository datasets,
                          @Value("${ced.limits.dataset-bytes-per-user:26214400}") long quotaBytes) {
        this.datasets = datasets;
        this.quotaBytes = quotaBytes;
    }

    @Transactional(readOnly = true)
    public List<Dataset> list(User owner) {
        return datasets.findByOwnerOrderByCreatedAtDesc(owner);
    }

    @Transactional(readOnly = true)
    public DatasetDtos.Usage usage(User owner) {
        List<Dataset> held = datasets.findByOwnerOrderByCreatedAtDesc(owner);
        long used = held.stream().mapToLong(Dataset::getSizeBytes).sum();
        return new DatasetDtos.Usage(used, quotaBytes, held.size());
    }

    @Transactional
    public Dataset upload(User owner, DatasetDtos.Upload request) {
        byte[] features = decode(request.features64(), "features");
        byte[] labels = decode(request.labels64(), "labels");

        // The declared shape has to match the bytes, or a later read would hand
        // the algorithm a matrix of the wrong width and it would cluster
        // something plausible and wrong.
        long expectedFeatures = (long) request.samples() * request.features() * Double.BYTES;
        if (features.length != expectedFeatures) {
            throw new IllegalArgumentException(
                    ("The feature matrix is %d bytes; %d samples x %d features of float64 is %d.")
                            .formatted(features.length, request.samples(), request.features(),
                                    expectedFeatures));
        }
        long expectedLabels = (long) request.samples() * Integer.BYTES;
        if (labels.length != expectedLabels) {
            throw new IllegalArgumentException(
                    ("The label vector is %d bytes; %d samples of int32 is %d.")
                            .formatted(labels.length, request.samples(), expectedLabels));
        }

        if (datasets.existsByOwnerAndNameIgnoreCase(owner, request.name())) {
            throw new NameTaken(request.name());
        }

        long used = datasets.bytesUsedBy(owner);
        long size = (long) features.length + labels.length;
        if (used + size > quotaBytes) {
            throw new QuotaExceeded(
                    ("This file is %.1f MB and you have %.1f MB of %.0f MB left. Delete a dataset "
                     + "and try again.")
                            .formatted(size / 1048576.0, (quotaBytes - used) / 1048576.0,
                                    quotaBytes / 1048576.0));
        }

        return datasets.save(Dataset.of(owner, request.name().trim(), request.samples(),
                request.features(), request.classes(), features, labels, Instant.now()));
    }

    @Transactional(readOnly = true)
    public Dataset get(User owner, UUID id) {
        return datasets.findByIdAndOwner(id, owner)
                .orElseThrow(() -> new NotFound("No dataset with id " + id + "."));
    }

    @Transactional
    public void delete(User owner, UUID id) {
        datasets.delete(get(owner, id));
    }

    private static byte[] decode(String base64, String what) {
        try {
            return Base64.getDecoder().decode(base64);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("The " + what + " are not valid base64.");
        }
    }

    public static class QuotaExceeded extends RuntimeException {
        public QuotaExceeded(String message) {
            super(message);
        }
    }

    public static class NameTaken extends RuntimeException {
        public NameTaken(String name) {
            super("You already have a dataset called \"" + name + "\".");
        }
    }
}
