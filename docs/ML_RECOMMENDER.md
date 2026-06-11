# ML Recommender Documentation

## Overview

The ML Recommender module provides intelligent music recommendations using **K-Means clustering** and **cosine similarity** based on audio features extracted by the Audio Analyzer (Step 4). It also includes a basic **genre classifier** using Random Forest.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ML Recommender Layer                │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │   MLRecommender      │  │   GenreClassifier     │ │
│  │                      │  │                       │ │
│  │  - K-Means clustering│  │  - Random Forest      │ │
│  │  - Cosine similarity │  │  - Label encoding     │ │
│  │  - Euclidean distance│  │  - Batch prediction   │ │
│  │  - Model persistence │  │  - Confidence scores  │ │
│  └──────────────────────┘  └──────────────────────┘ │
│              │                         │             │
│              └─────────┬───────────────┘             │
│                        ▼                             │
│  ┌──────────────────────────────────────────────┐   │
│  │           audio_utils.py                      │   │
│  │  - extract_feature_vector() (30-dim vector)   │   │
│  │  - normalize_features()                       │   │
│  │  - calculate_feature_similarity()             │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              PostgreSQL Database                     │
│  - audio_features (feature vectors + cluster_id)    │
│  - recommendations (similarity scores + algorithm)  │
│  - music (genre labels)                             │
└─────────────────────────────────────────────────────┘
```

---

## Algorithms

### 1. K-Means Clustering

**Purpose**: Group similar music tracks into clusters to optimize recommendation search.

**Implementation**: `sklearn.cluster.KMeans`

**Process**:
1. Extract feature vectors from all `AudioFeatures` records
2. Standardize features with `StandardScaler`
3. Fit K-Means with configurable `n_clusters` (default: 8)
4. Assign `cluster_id` to each track in the database
5. Persist model and scaler to disk via `joblib`

**Hyperparameters**:
| Parameter | Default | Description |
|-----------|---------|-------------|
| `n_clusters` | 8 | Number of clusters |
| `n_init` | 10 | Number of centroid initializations |
| `max_iter` | 300 | Maximum iterations per run |
| `random_state` | 42 | Reproducibility seed |

**Output Metrics**:
- **Inertia**: Sum of squared distances to nearest centroid (lower = tighter clusters)
- **Cluster distribution**: Number of tracks per cluster

---

### 2. Cosine Similarity (Algorithm 1)

**Purpose**: Measure angular similarity between feature vectors.

**Formula**:
```
similarity(A, B) = (A · B) / (||A|| × ||B||)
```

**Range**: -1 to +1 (normalized to 0-1 for the API)

**When to use**: Best for comparing overall musical character regardless of magnitude differences.

---

### 3. Euclidean Distance (Algorithm 2)

**Purpose**: Measure absolute distance in feature space.

**Formula**:
```
distance(A, B) = √(Σ(Ai - Bi)²)
similarity = 1 - (distance / max_distance)
```

**Range**: 0-1 (inverted distance)

**When to use**: Better when absolute feature values matter (e.g., exact tempo matching).

---

### 4. Cluster-Aware Cosine Similarity (Algorithm 3) — Default

**Purpose**: Combine clustering with cosine similarity for optimized recommendations.

**Process**:
1. Identify the source track's cluster
2. Search within the same cluster first
3. If fewer candidates than requested, expand to all clusters
4. Compute cosine similarity within the candidate pool
5. Return top-N by similarity score

**Advantages**:
- Faster search (narrowed candidate pool)
- More relevant results (same musical neighbourhood)
- Automatic fallback for small databases

---

### 5. Genre Classification (Random Forest)

**Purpose**: Predict music genre from audio features.

**Implementation**: `sklearn.ensemble.RandomForestClassifier`

**Process**:
1. Collect tracks with known genre labels
2. Extract feature vectors
3. Train Random Forest with 100 estimators
4. Evaluate with train/test split (80/20)
5. Persist model, scaler, and label encoder

**Hyperparameters**:
| Parameter | Default | Description |
|-----------|---------|-------------|
| `n_estimators` | 100 | Number of decision trees |
| `test_size` | 0.2 | Test split ratio |
| `random_state` | 42 | Reproducibility seed |

**Requirements**: At least 5 labelled tracks for training.

---

## Feature Vector

The recommendation engine uses a 30-dimensional feature vector (defined in `audio_utils.py`):

| # | Feature | Dimensions | Normalization |
|---|---------|-----------|---------------|
| 1 | Tempo | 1 | `(tempo - 40) / 160` |
| 2 | Key (one-hot) | 12 | Binary encoding |
| 3 | Mode | 1 | 0 or 1 |
| 4 | Energy | 1 | Already 0-1 |
| 5 | Valence | 1 | Already 0-1 |
| 6 | Spectral centroid | 1 | `centroid / 8000` |
| 7 | MFCCs (first 13) | 13 | `(mfcc + 50) / 100` |
| **Total** | | **30** | |

Additionally, `StandardScaler` is applied before clustering and similarity computation.

---

## API Endpoints

### GET /api/recommend/{music_id}

Generate recommendations for a source track.

**Parameters**:
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `music_id` | path | required | Source track ID |
| `limit` | query | 10 | Max recommendations (1-50) |
| `algorithm` | query | 3 | 1=cosine, 2=euclidean, 3=cluster-aware |

**Response**: `List[RecommendationWithMusic]`

**Example Response**:
```json
[
  {
    "id": 1,
    "user_id": 1,
    "source_music_id": 5,
    "recommended_music_id": 12,
    "similarity_score": 0.92,
    "algorithm": 3,
    "created_at": "2026-01-15T10:30:00Z",
    "recommended_music": {
      "id": 12,
      "title": "Summer Breeze",
      "artist": "Chill Vibes",
      "genre": "electronic"
    }
  }
]
```

---

### POST /api/recommend/train

Train/retrain the K-Means clustering model.

**Parameters**:
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `n_clusters` | query | 8 | Number of clusters (2-50) |

**Response**:
```json
{
  "status": "success",
  "total_tracks": 150,
  "n_clusters": 8,
  "inertia": 234.56,
  "cluster_distribution": {
    "0": 22, "1": 18, "2": 15, "3": 20,
    "4": 19, "5": 17, "6": 21, "7": 18
  }
}
```

---

### GET /api/recommend/clusters

View cluster distribution statistics.

**Response**:
```json
{
  "status": "ok",
  "total_clustered_tracks": 150,
  "n_clusters": 8,
  "cluster_distribution": {"0": 22, "1": 18, ...},
  "cluster_music_ids": {"0": [1, 5, 12, ...], ...}
}
```

---

### POST /api/recommend/train-genre

Train the genre classifier on labelled tracks.

**Response**:
```json
{
  "status": "success",
  "total_samples": 100,
  "n_classes": 5,
  "classes": ["rock", "pop", "jazz", "electronic", "classical"],
  "accuracy": 0.85,
  "classification_report": {...},
  "feature_importances": [0.12, 0.08, ...]
}
```

---

### POST /api/recommend/predict-genre/{music_id}

Predict genre for a specific track.

**Parameters**:
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `music_id` | path | required | Track to classify |

**Response**:
```json
{
  "music_id": 5,
  "predicted_genre": "rock",
  "confidence": 0.78,
  "genre_probabilities": {
    "rock": 0.78,
    "pop": 0.12,
    "electronic": 0.06,
    "jazz": 0.03,
    "classical": 0.01
  }
}
```

---

### GET /api/recommend/user/{user_id}

Get recommendation history for a user.

**Parameters**:
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `user_id` | path | required | User ID |
| `skip` | query | 0 | Pagination offset |
| `limit` | query | 100 | Max results |

**Response**: `List[RecommendationResponse]`

---

## Model Persistence

Models are saved to `backend/models/` directory:

| File | Model | Format |
|------|-------|--------|
| `kmeans_model.joblib` | K-Means clustering | scikit-learn KMeans |
| `scaler_model.joblib` | Feature scaler (for clustering) | StandardScaler |
| `genre_classifier.joblib` | Genre classifier | RandomForestClassifier |
| `genre_label_encoder.joblib` | Genre label encoder | LabelEncoder |
| `genre_scaler.joblib` | Feature scaler (for genre) | StandardScaler |

Models are automatically loaded from disk when endpoints are called.

---

## Training Script

A standalone training script is available for batch operations:

```bash
cd backend

# Train K-Means clustering (default 8 clusters)
python -m app.services.train_models

# Train with custom cluster count
python -m app.services.train_models --clusters 12

# Train genre classifier only
python -m app.services.train_models --genre

# Predict genres for unlabelled tracks
python -m app.services.train_models --predict-genres

# Train everything
python -m app.services.train_models --all
```

---

## Recommendation Workflow

### Complete Flow

```
1. Upload audio files           → POST /api/music/upload
2. Analyse each track           → POST /api/analyze/{music_id}
3. Train clustering model       → POST /api/recommend/train
4. (Optional) Train genre model → POST /api/recommend/train-genre
5. Get recommendations          → GET  /api/recommend/{music_id}
6. View clusters                → GET  /api/recommend/clusters
```

### Algorithm Selection Guide

| Scenario | Recommended Algorithm |
|----------|----------------------|
| Large database (100+ tracks) | 3 (cluster-aware) |
| Small database (<20 tracks) | 1 (cosine similarity) |
| Exact tempo/energy matching | 2 (euclidean distance) |
| General recommendation | 3 (default) |

---

## Performance Considerations

### Clustering
- Training scales as O(n × k × d × i) where n=samples, k=clusters, d=dimensions, i=iterations
- For 1000 tracks: ~1-2 seconds
- Re-training recommended after every 50-100 new tracks

### Similarity Computation
- Cosine similarity: O(n × d) per query
- Cluster-aware: O(n/k × d) per query (faster)
- Results cached in `recommendations` table

### Memory
- Feature vectors: ~240 bytes per track (30 floats × 8 bytes)
- 10,000 tracks ≈ 2.4 MB in memory
- Models: ~10-50 KB on disk

---

## Implementation Details

### Source Files

| File | Description |
|------|-------------|
| `backend/app/services/ml_recommender.py` | K-Means + similarity engine |
| `backend/app/services/genre_classifier.py` | Random Forest genre classifier |
| `backend/app/services/train_models.py` | CLI training script |
| `backend/app/routes/recommend.py` | API endpoints |
| `backend/app/utils/audio_utils.py` | Feature vector extraction |

### Dependencies (from requirements.txt)

- `scikit-learn==1.5.2` — K-Means, Random Forest, metrics
- `numpy==1.26.4` — Numerical operations
- `scipy==1.14.1` — Distance computations
- `joblib==1.4.2` — Model serialization
- `pandas==2.2.3` — Data manipulation (optional)

---

## Troubleshooting

### Common Issues

**1. "No audio features found in database"**
- Run audio analysis first: `POST /api/analyze/{music_id}`
- Ensure tracks have been uploaded and analyzed

**2. "Genre classifier not trained"**
- Train via: `POST /api/recommend/train-genre`
- Need at least 5 tracks with genre labels

**3. Empty recommendations**
- Ensure at least 2 tracks are analyzed
- Train clustering: `POST /api/recommend/train`
- Try algorithm=1 (cosine) for small databases

**4. Low genre classification accuracy**
- Add more labelled tracks
- Ensure genre labels are consistent (lowercase, trimmed)
- Check that tracks have diverse features

---

## Future Enhancements

1. **Collaborative Filtering**: User-based recommendations from listening history
2. **Content-Based Filtering**: Combine audio features with metadata (artist, album)
3. **Deep Learning**: CNN-based similarity on spectrograms
4. **A/B Testing**: Compare recommendation algorithms
5. **Real-time Updates**: Incremental model updates on new tracks
6. **Recommendation Explanations**: Show which features caused similarity

---

## References

- [scikit-learn K-Means](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [Random Forest Classifier](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html)
- [Music Information Retrieval](https://musicinformationretrieval.com/)

---

## Next Steps

Refer to `STATE.md` for current implementation status.

Next module: **STEP 6 — FRONTEND** (React UI with visualizations)
