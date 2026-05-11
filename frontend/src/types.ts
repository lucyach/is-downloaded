export type CheckedTrack = {
  artist: string;
  title: string;
  album: string | null;
  playcount: number;
  downloaded: boolean;
  matched_path: string | null;
};

export type CheckTopTracksResponse = {
  user: string;
  total: number;
  results: CheckedTrack[];
};
