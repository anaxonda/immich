export const AlbumTimelineOrder = {
  Asc: 'asc',
  Desc: 'desc',
  FilenameAsc: 'filename-asc',
  FilenameDesc: 'filename-desc',
} as const;

export type AlbumTimelineOrder = (typeof AlbumTimelineOrder)[keyof typeof AlbumTimelineOrder];

export const isFilenameAlbumOrder = (order?: string): order is AlbumTimelineOrder =>
  order === AlbumTimelineOrder.FilenameAsc || order === AlbumTimelineOrder.FilenameDesc;

export const isDescendingAlbumOrder = (order?: string) =>
  order === AlbumTimelineOrder.Desc || order === AlbumTimelineOrder.FilenameDesc;
