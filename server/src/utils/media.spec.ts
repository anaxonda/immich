import { VideoFieldOrder } from 'src/enum';
import { getDeinterlaceParity } from 'src/utils/media';

describe(getDeinterlaceParity.name, () => {
  it.each([
    { fieldOrder: VideoFieldOrder.Unknown, expected: null },
    { fieldOrder: VideoFieldOrder.Progressive, expected: null },
    { fieldOrder: VideoFieldOrder.Tt, expected: 'tff' },
    { fieldOrder: VideoFieldOrder.Tb, expected: 'tff' },
    { fieldOrder: VideoFieldOrder.Bb, expected: 'bff' },
    { fieldOrder: VideoFieldOrder.Bt, expected: 'bff' },
  ])('maps $fieldOrder to $expected', ({ fieldOrder, expected }) => {
    expect(getDeinterlaceParity(fieldOrder)).toBe(expected);
  });
});
