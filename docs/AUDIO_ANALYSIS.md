# Audio Analysis Documentation

## Overview

The Audio Analysis module uses **librosa** (Python library for audio and music analysis) to extract comprehensive audio features from music files. These features are used for music similarity comparison and recommendation generation.

---

## Extracted Audio Features

### 1. Temporal Features

**Tempo (BPM)**
- **Description**: Beats per minute - the speed of the music
- **Range**: Typically 40-200 BPM
- **Extraction Method**: `librosa.beat.beat_track()`
- **Use Case**: Matching songs with similar energy and dancability

**Duration (seconds)**
- **Description**: Total length of the audio track
- **Range**: Variable
- **Extraction Method**: `librosa.get_duration()`
- **Use Case**: Filtering by track length

---

### 2. Tonal Features

**Key**
- **Description**: The musical key (pitch class) of the track
- **Range**: 0-11 (0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B)
- **Extraction Method**: Chromagram analysis with `librosa.feature.chroma_cqt()`
- **Use Case**: Finding harmonically compatible tracks

**Mode**
- **Description**: Major (1) or Minor (0) tonality
- **Range**: 0 (minor) or 1 (major)
- **Extraction Method**: Comparison of major third vs minor third prominence in chromagram
- **Use Case**: Matching emotional tone (major = brighter, minor = darker)

---

### 3. Energy & Dynamics Features

**Loudness (dB)**
- **Description**: Average loudness of the track in decibels
- **Range**: Typically -60 to 0 dB
- **Extraction Method**: RMS energy converted to dB with `librosa.feature.rms()` + `librosa.amplitude_to_db()`
- **Use Case**: Matching tracks with similar volume characteristics

**Energy**
- **Description**: Normalized RMS energy representing intensity
- **Range**: 0.0 - 1.0 (normalized)
- **Extraction Method**: RMS energy normalized to 0-1 scale
- **Use Case**: Finding high-energy vs low-energy tracks

---

### 4. Mood/Emotion Features

**Valence**
- **Description**: Musical positivity/happiness (0 = negative/sad, 1 = positive/happy)
- **Range**: 0.0 - 1.0
- **Extraction Method**: Heuristic based on mode, tempo, and energy
  - Major mode contributes to higher valence
  - Faster tempo contributes to higher valence
  - Higher energy contributes to higher valence
- **Formula**: `(mode + tempo_normalized + energy) / 3`
- **Use Case**: Mood-based music recommendations

---

### 5. Spectral Features

**Spectral Centroid**
- **Description**: Center of mass of the spectrum - indicates "brightness" of sound
- **Range**: 0-8000 Hz typically
- **Extraction Method**: `librosa.feature.spectral_centroid()`
- **Statistics**: Mean and standard deviation
- **Use Case**: Distinguishing bright vs dark timbres

**Spectral Bandwidth**
- **Description**: Width of the frequency spectrum
- **Range**: Variable
- **Extraction Method**: `librosa.feature.spectral_bandwidth()`
- **Statistics**: Mean and standard deviation
- **Use Case**: Measuring tonal complexity

**Spectral Rolloff**
- **Description**: Frequency below which 85% of spectral energy is contained
- **Range**: Variable
- **Extraction Method**: `librosa.feature.spectral_rolloff()`
- **Statistics**: Mean and standard deviation
- **Use Case**: Distinguishing harmonic vs percussive content

---

### 6. Timbre Features (MFCCs)

**Mel-Frequency Cepstral Coefficients (MFCCs)**
- **Description**: Compact representation of the spectral envelope - captures timbre/texture
- **Number of Coefficients**: 20 (default)
- **Range**: Varies per coefficient (typically -50 to +50)
- **Extraction Method**: `librosa.feature.mfcc()`
- **Statistics**: Mean and standard deviation for each coefficient
- **Use Case**: Most important for distinguishing instrument types and vocal characteristics
- **Stored Format**: JSON arrays with 20 values each for mean and std

**Why MFCCs are Important**:
- MFCCs are the most powerful features for timbre similarity
- They capture the "color" or "texture" of sound
- Essential for identifying similar-sounding instruments or vocals

---

### 7. Rhythm Features

**Zero-Crossing Rate**
- **Description**: Rate at which signal changes sign - indicates noisiness/percussiveness
- **Range**: 0.0 - 1.0
- **Extraction Method**: `librosa.feature.zero_crossing_rate()`
- **Statistics**: Mean and standard deviation
- **Use Case**: Distinguishing percussive vs harmonic content

---

### 8. Harmony Features

**Chroma STFT**
- **Description**: Distribution of energy across 12 pitch classes (C, C#, D, ..., B)
- **Number of Features**: 12 (one per pitch class)
- **Range**: 0.0 - 1.0 (normalized)
- **Extraction Method**: `librosa.feature.chroma_stft()`
- **Statistics**: Mean and standard deviation for each pitch class
- **Use Case**: Harmonic similarity and key detection
- **Stored Format**: JSON arrays with 12 values each for mean and std

---

## Feature Vector for ML

For machine learning algorithms (similarity, clustering), features are combined into a fixed-length vector:

**Vector Components** (43 dimensions total):
1. Tempo (normalized) - 1 value
2. Key (one-hot encoded) - 12 values
3. Mode - 1 value
4. Energy - 1 value
5. Valence - 1 value
6. Spectral centroid (normalized) - 1 value
7. MFCCs (first 13 coefficients, normalized) - 13 values

**Total**: 30 dimensions for core similarity comparison

---

## Feature Normalization

Raw features are normalized to 0-1 range for ML algorithms:

| Feature | Raw Range | Normalization |
|---------|-----------|---------------|
| Tempo | 40-200 BPM | `(tempo - 40) / 160` |
| Loudness | -60 to 0 dB | `(loudness + 60) / 60` |
| Energy | 0.0 - 1.0 | Already normalized |
| Valence | 0.0 - 1.0 | Already normalized |
| Spectral Centroid | 0-8000 Hz | `centroid / 8000` |
| MFCCs | -50 to +50 | `(mfcc + 50) / 100` |

---

## Usage in API

### 1. Analyze a Track

**Endpoint**: `POST /api/analyze/{music_id}`

**Process**:
1. Load audio file with librosa
2. Extract all features
3. Estimate valence from mode/tempo/energy
4. Store features in `audio_features` table
5. Update track duration if not set

**Response**: Complete AudioFeatures object with all extracted values

**Error Handling**:
- Returns 400 if already analyzed
- Returns 403 if unauthorized
- Returns 404 if music not found
- Returns 500 if analysis fails

### 2. Retrieve Features

**Endpoint**: `GET /api/analyze/features/{music_id}`

**Process**:
1. Query `audio_features` table
2. Return stored features

**Response**: AudioFeatures object

---

## Implementation Details

### AudioAnalyzer Service

**Location**: `backend/app/services/audio_analyzer.py`

**Class**: `AudioAnalyzer`

**Methods**:
- `analyze(file_path)`: Main analysis method
- `_extract_temporal_features()`: Tempo, duration
- `_extract_tonal_features()`: Key, mode
- `_extract_energy_features()`: Loudness, energy
- `_extract_spectral_features()`: Centroid, bandwidth, rolloff
- `_extract_timbre_features()`: MFCCs
- `_extract_rhythm_features()`: Zero-crossing rate
- `_extract_harmony_features()`: Chroma STFT
- `estimate_valence()`: Valence estimation from other features

**Configuration**:
- `sr`: Sample rate (default: 22050 Hz) - balanced speed/quality
- `n_mfcc`: Number of MFCC coefficients (default: 20)

**Error Handling**:
- Each feature extraction method has try-except blocks
- Failed features return `None` instead of crashing
- Warnings logged for debugging

---

## Audio Utilities

**Location**: `backend/app/utils/audio_utils.py`

**Functions**:

1. `normalize_features(features)`: Normalize all features to 0-1 range
2. `extract_feature_vector(features)`: Create fixed-length ML vector
3. `calculate_feature_similarity(features1, features2)`: Cosine similarity between two tracks
4. `get_feature_weights()`: Importance weights for different feature categories

**Feature Weights**:
```python
{
    "temporal": 1.0,   # tempo
    "tonal": 0.8,      # key, mode
    "energy": 1.2,     # loudness, energy
    "spectral": 1.0,   # spectral features
    "timbre": 1.5,     # MFCCs (most important)
    "rhythm": 0.7,     # zero-crossing rate
    "harmony": 0.9     # chroma features
}
```

---

## Performance Considerations

### Analysis Speed
- Typical track (3-4 minutes): ~5-15 seconds
- Factors: File size, sample rate, CPU speed
- Optimization: Use `sr=22050` instead of higher rates

### Memory Usage
- librosa loads entire file into memory
- Large files (>10 minutes) may require significant RAM
- Consider streaming for very long files in production

### Recommendations
- Analyze tracks asynchronously (background tasks)
- Cache results in database (don't re-analyze)
- Consider batch processing for bulk uploads

---

## Supported Audio Formats

**Fully Supported** (via librosa):
- MP3 (requires ffmpeg or audioread)
- WAV (native)
- FLAC (native)
- OGG (requires audioread)

**Sample Rate**: All files resampled to 22050 Hz for consistency

---

## Example Analysis Output

```json
{
  "id": 1,
  "music_id": 1,
  "tempo": 128.5,
  "duration": 245.3,
  "key": 7,
  "mode": 1,
  "loudness": -8.2,
  "energy": 0.73,
  "valence": 0.68,
  "spectral_centroid_mean": 2456.8,
  "spectral_centroid_std": 423.1,
  "spectral_bandwidth_mean": 1832.5,
  "spectral_bandwidth_std": 312.7,
  "spectral_rolloff_mean": 4123.9,
  "spectral_rolloff_std": 687.4,
  "mfcc_mean": [12.3, -5.6, 8.9, -3.2, ...],
  "mfcc_std": [2.1, 1.8, 2.3, 1.5, ...],
  "zero_crossing_rate_mean": 0.045,
  "zero_crossing_rate_std": 0.012,
  "chroma_stft_mean": [0.82, 0.31, 0.54, ...],
  "chroma_stft_std": [0.12, 0.08, 0.15, ...],
  "cluster_id": null
}
```

---

## Troubleshooting

### Common Issues

**1. librosa not installed**
```bash
pip install librosa
```

**2. ffmpeg missing (for MP3 support)**
```bash
# Windows
choco install ffmpeg
# Linux
sudo apt install ffmpeg
# Mac
brew install ffmpeg
```

**3. Analysis takes too long**
- Reduce sample rate: `AudioAnalyzer(sr=16000)`
- Skip some feature categories if not needed

**4. Memory errors on large files**
- Increase system RAM
- Process in smaller chunks
- Use lower sample rate

---

## Future Enhancements

1. **Genre Classification**: Train a classifier on extracted features
2. **Beat Detection**: More sophisticated rhythm analysis
3. **Mood Detection**: Improve valence estimation with ML model
4. **Instrumentation Detection**: Identify instruments present
5. **Vocal Detection**: Separate vocal vs instrumental content
6. **Real-time Analysis**: Stream processing for live audio

---

## References

- [librosa documentation](https://librosa.org/doc/latest/index.html)
- [MFCCs explained](https://en.wikipedia.org/wiki/Mel-frequency_cepstrum)
- [Audio feature extraction research](https://scholar.google.com/scholar?q=audio+feature+extraction)

---

## Next Steps

Refer to `STATE.md` for current implementation status.

Next module: **STEP 5 - ML RECOMMENDER** (K-means clustering and similarity-based recommendations)
