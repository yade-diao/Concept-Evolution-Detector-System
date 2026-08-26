package dev.yade.ced.datasets;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/**
 * What crosses the wire for uploaded datasets.
 *
 * The matrices travel base64-encoded inside JSON rather than as multipart. They
 * are already in memory in the browser as typed arrays - the file was parsed
 * there to run on it - so this keeps one representation on the wire and one
 * content type in the client, at the cost of a third more bytes. At a 25 MB
 * quota that trade is not close.
 */
public final class DatasetDtos {

    private DatasetDtos() {
    }

    public record Upload(
            @NotBlank @Size(max = 120) String name,
            @NotNull @Min(2) @Max(100_000) Integer samples,
            @NotNull @Min(2) @Max(1_000_000) Integer features,
            @NotNull @Min(1) @Max(10_000) Integer classes,
            /**
             * Row-major float64 feature matrix, base64.
             *
             * Bounded here rather than only by the quota: the quota is checked
             * after decoding, and decoding is what a 300 MB body would spend
             * this machine's memory on. 36 million characters is the whole
             * 25 MB allowance plus base64's third.
             */
            @NotBlank @Size(max = 36_000_000) String features64,
            /** int32 label vector, one per sample, base64. */
            @NotBlank @Size(max = 1_000_000) String labels64) {
    }

    /** A listing row: everything except the megabytes. */
    public record Summary(
            UUID id,
            String name,
            int samples,
            int features,
            int classes,
            long sizeBytes,
            Instant createdAt) {

        public static Summary of(Dataset dataset) {
            return new Summary(dataset.getId(), dataset.getName(), dataset.getSamples(),
                    dataset.getFeatures(), dataset.getClasses(), dataset.getSizeBytes(),
                    dataset.getCreatedAt());
        }
    }

    /** The matrices, for a browser that does not have this file cached. */
    public record Content(
            UUID id,
            String name,
            int samples,
            int features,
            int classes,
            String features64,
            String labels64) {
    }

    /** How much of the allowance is gone, so the client can say so before an upload fails. */
    public record Usage(long usedBytes, long quotaBytes, int datasets) {
    }
}
