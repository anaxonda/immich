import { AssetOrderBy } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import { TimelineDay } from '$lib/managers/timeline-manager/timeline-day.svelte';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import { AlbumTimelineOrder } from '$lib/utils/album-order';
import { fromISODateTimeUTCToObject } from '$lib/utils/timeline-util';
import { ViewerAsset } from './viewer-asset.svelte';

describe(TimelineDay.name, () => {
  it('sorts assets by filename in ascending order', () => {
    const timelineDay = new TimelineDay({} as never, 0, 1, 'Group', AssetOrderBy.TakenAt);
    const c = timelineAssetFactory.build({ originalFileName: 'c.jpg' });
    const a = timelineAssetFactory.build({ originalFileName: 'a.jpg' });
    const b = timelineAssetFactory.build({ originalFileName: 'b.jpg' });

    timelineDay.viewerAssets = [new ViewerAsset(c), new ViewerAsset(a), new ViewerAsset(b)];
    timelineDay.sortAssets(AlbumTimelineOrder.FilenameAsc);

    expect(timelineDay.getAssets().map((asset) => asset.originalFileName)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('breaks filename ties with fileCreatedAt and id', () => {
    const timelineDay = new TimelineDay({} as never, 0, 1, 'Group', AssetOrderBy.TakenAt);
    const first = timelineAssetFactory.build({
      id: 'b-id',
      originalFileName: 'same.jpg',
      fileCreatedAt: fromISODateTimeUTCToObject('2026-01-01T00:00:00.000Z'),
    });
    const second = timelineAssetFactory.build({
      id: 'a-id',
      originalFileName: 'same.jpg',
      fileCreatedAt: fromISODateTimeUTCToObject('2026-01-01T00:00:00.000Z'),
    });
    const third = timelineAssetFactory.build({
      id: 'c-id',
      originalFileName: 'same.jpg',
      fileCreatedAt: fromISODateTimeUTCToObject('2026-01-02T00:00:00.000Z'),
    });

    timelineDay.viewerAssets = [new ViewerAsset(third), new ViewerAsset(first), new ViewerAsset(second)];

    timelineDay.sortAssets(AlbumTimelineOrder.FilenameAsc);
    expect(timelineDay.getAssets().map((asset) => asset.id)).toEqual(['a-id', 'b-id', 'c-id']);

    timelineDay.sortAssets(AlbumTimelineOrder.FilenameDesc);
    expect(timelineDay.getAssets().map((asset) => asset.id)).toEqual(['c-id', 'b-id', 'a-id']);
  });

  it('breaks fileCreatedAt ties with filename and id', () => {
    const timelineDay = new TimelineDay({} as never, 0, 1, 'Group', AssetOrderBy.TakenAt);
    const first = timelineAssetFactory.build({
      id: 'b-id',
      originalFileName: 'beta.jpg',
      fileCreatedAt: fromISODateTimeUTCToObject('2026-01-01T00:00:00.000Z'),
    });
    const second = timelineAssetFactory.build({
      id: 'a-id',
      originalFileName: 'beta.jpg',
      fileCreatedAt: fromISODateTimeUTCToObject('2026-01-01T00:00:00.000Z'),
    });
    const third = timelineAssetFactory.build({
      id: 'c-id',
      originalFileName: 'alpha.jpg',
      fileCreatedAt: fromISODateTimeUTCToObject('2026-01-01T00:00:00.000Z'),
    });

    timelineDay.viewerAssets = [new ViewerAsset(first), new ViewerAsset(second), new ViewerAsset(third)];

    timelineDay.sortAssets(AlbumTimelineOrder.Asc);
    expect(timelineDay.getAssets().map((asset) => asset.id)).toEqual(['c-id', 'a-id', 'b-id']);

    timelineDay.sortAssets(AlbumTimelineOrder.Desc);
    expect(timelineDay.getAssets().map((asset) => asset.id)).toEqual(['b-id', 'a-id', 'c-id']);
  });
});
