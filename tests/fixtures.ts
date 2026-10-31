// Synthetic fixtures only; no real archive, channel or file names.
export const NOW = Date.parse('2026-10-31T12:00:00Z');

export const fullSnapshot = {
  v: 1,
  generatedAt: NOW - 30_000,
  queue: {
    running: true,
    pausedReason: null,
    next: { archive: 'Sample Archive', number: 42, file: '42 - sample clip.mp4', waitingFor: '' },
  },
  quota: { uploadsLeftToday: 7, resetsAt: NOW + 3_600_000 },
  attention: [
    { id: 'a1', title: 'Made for kids not set', detail: 'Held until you choose.', action: null },
  ],
  archives: [
    {
      id: 3,
      name: 'Sample Archive',
      monitoring: true,
      lastScanAt: NOW - 120_000,
      channel: '@example-test',
      playlist: 'Sample Playlist',
      upTo: 41,
      unuploaded: 5,
    },
  ],
  jobs: [
    {
      id: 'job-1',
      name: 'Sample job',
      archive: 'Sample Archive',
      uploaded: 3,
      remaining: 1,
      state: 'held',
      held: { number: 42, file: '42 - sample clip.mp4', reason: 'Upload result uncertain' },
    },
  ],
  recent: [{ at: NOW - 60_000, text: 'Uploaded #41' }],
};
