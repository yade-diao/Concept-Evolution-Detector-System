package dev.yade.ced.datasets;

import dev.yade.ced.auth.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A matrix somebody uploaded.
 *
 * Stored as the two arrays the algorithm reads - a row-major float64 feature
 * matrix and a label vector - rather than as the file they came from. The
 * browser already parsed the file in order to run on it; keeping the original
 * would mean a second parser on the server, and two parsers for one format are
 * two answers to what the file says.
 */
@Entity
@Table(name = "datasets")
public class Dataset {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private int samples;

    @Column(nullable = false)
    private int features;

    @Column(nullable = false)
    private int classes;

    @Column(name = "features_blob", nullable = false)
    private byte[] featuresBlob;

    @Column(name = "labels_blob", nullable = false)
    private byte[] labelsBlob;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Dataset() {
        // for JPA
    }

    public static Dataset of(User owner, String name, int samples, int features, int classes,
                             byte[] featuresBlob, byte[] labelsBlob, Instant createdAt) {
        Dataset dataset = new Dataset();
        dataset.id = UUID.randomUUID();
        dataset.owner = owner;
        dataset.name = name;
        dataset.samples = samples;
        dataset.features = features;
        dataset.classes = classes;
        dataset.featuresBlob = featuresBlob;
        dataset.labelsBlob = labelsBlob;
        dataset.sizeBytes = (long) featuresBlob.length + labelsBlob.length;
        dataset.createdAt = createdAt;
        return dataset;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public int getSamples() {
        return samples;
    }

    public int getFeatures() {
        return features;
    }

    public int getClasses() {
        return classes;
    }

    public byte[] getFeaturesBlob() {
        return featuresBlob;
    }

    public byte[] getLabelsBlob() {
        return labelsBlob;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
