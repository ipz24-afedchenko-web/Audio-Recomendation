const strings = {
  /* ── ErrorBoundary ── */
  errorBoundary: {
    title: 'Something went wrong',
    unknownError: 'Unknown error',
    reload: 'Reload page',
  },

  /* ── Navbar ── */
  nav: {
    uploadSingle: '\uD83C\uDFB5 Single Track',
    uploadBulk: '\uD83D\uDCC2 Bulk Upload',
  },

  /* ── BulkUploadPage ── */
  bulk: {
    status: {
      idle: 'Pending',
      tagging: 'AI processing\u2026',
      tagged: 'Ready',
      uploading: 'Uploading\u2026',
      analyzing: 'Analyzing\u2026',
      done: '\u2713 Uploaded',
      error: '\u2717 Error',
    },
    placeholder: {
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      genre: 'Genre',
    },
    tooltip: {
      aiAutoFill: 'AI auto-fill',
      aiUnavailable: 'AI unavailable',
      remove: 'Remove',
    },
    columnHeaders: ['Title *', 'Artist', 'Album', 'Genre', 'Status', ''],
    pageTitle: 'Bulk Upload',
    pageSubtitle:
      'Drag multiple files, AI will automatically determine genre, artist, and title',
    dropzone: {
      active: 'Release files here',
      inactive: 'Drag audio files here',
      hint: 'or click to select \u00B7 MP3, WAV, FLAC, OGG',
    },
    aiButton: {
      tagging: 'AI processing\u2026',
      idle: '\u2728 AI Auto-fill All',
    },
    uploadButton: {
      uploading: 'Uploading\u2026',
      idle: (n) => `\u2B06 Upload All (${n})`,
    },
    clearDone: 'Clear Uploaded',
    clearAll: 'Clear All',
    stats: {
      ready: (done, total) => `${done}/${total} ready`,
      analyzing: (n) => ` \u00B7 ${n} analyzing\u2026`,
      errors: (n) => ` \u00B7 ${n} errors`,
    },
    empty: {
      title: 'No files selected',
      button: 'Select Files',
    },
    footer: {
      dashboard: 'Go to Dashboard',
      uploadMore: 'Upload More',
    },
    messages: {
      tagSuccess: (n) => `\u2728 AI auto-fill completed for ${n} tracks`,
      tagPartial: (success, failed) =>
        `AI processing complete: ${success} successful, ${failed} errors`,
      uploadSuccess: (n) =>
        `\u2713 Uploaded ${n} tracks. Analysis running in background\u2026`,
      dupError: (detail) => `Duplicate: ${detail}`,
      uploadError: 'Upload error',
      aiError: 'AI error',
      analysisError: 'Analysis error',
      analysisTimeout:
        'Analysis took longer than expected \u2014 refresh the page later',
      analysisCheckFailed: 'Could not verify analysis status',
    },
  },
};

export default strings;
