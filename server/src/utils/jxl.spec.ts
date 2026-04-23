import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExifOrientation } from 'src/enum';
import { parseJxlIntrinsicOrientation, readJxlIntrinsicOrientation } from 'src/utils/jxl';

const fromHex = (hex: string) => Buffer.from(hex.replaceAll(/\s+/g, ''), 'hex');
const box = (type: string, payload: Buffer) => {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
};

describe('parseJxlIntrinsicOrientation', () => {
  it('should parse intrinsic orientation from a raw codestream', () => {
    const buffer = fromHex(`
      00 00 00 0c 4a 58 4c 20 0d 0a 87 0a
      00 00 00 14 66 74 79 70 6a 78 6c 20 00 00 00 00 6a 78 6c 20
      00 00 00 12 6a 78 6c 70 00 00 00 00 ff 0a c9 2d 10 13 00 00
      00 51 6a 62 72 64 c0 70 db 00 82 20 08 2d 03 02 40 62 00 a1
    `);

    expect(parseJxlIntrinsicOrientation(buffer.subarray(44))).toBe(ExifOrientation.Rotate90CW);
  });

  it('should parse metadata-only jpeg xl codestream orientation as identity', () => {
    const buffer = fromHex(`
      00 00 00 0c 4a 58 4c 20 0d 0a 87 0a
      00 00 00 14 66 74 79 70 6a 78 6c 20 00 00 00 00 6a 78 6c 20
      00 00 00 13 6a 78 6c 70 00 00 00 00 ff 0a aa 3d 68 f5 0c 00
      00 05 00 62 72 6f 62 78 6d 6c 20 1b cd 1d 20 2c 0e ec 66 9f
    `);

    expect(parseJxlIntrinsicOrientation(buffer.subarray(44))).toBe(ExifOrientation.Horizontal);
  });

  it('should reject invalid data', () => {
    expect(parseJxlIntrinsicOrientation(Buffer.from('not-a-jxl'))).toBeNull();
  });
});

describe('readJxlIntrinsicOrientation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'immich-jxl-'));
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  it('should parse intrinsic orientation from a container file', async () => {
    const file = join(tempDir, 'intrinsic.jxl');
    const buffer = fromHex(`
      00 00 00 0c 4a 58 4c 20 0d 0a 87 0a
      00 00 00 14 66 74 79 70 6a 78 6c 20 00 00 00 00 6a 78 6c 20
      00 00 00 12 6a 78 6c 70 00 00 00 00 ff 0a c9 2d 10 13 00 00
      00 51 6a 62 72 64 c0 70 db 00 82 20 08 2d 03 02 40 62 00 a1
    `);

    await writeFile(file, buffer);

    await expect(readJxlIntrinsicOrientation(file)).resolves.toBe(ExifOrientation.Rotate90CW);
  });

  it('should treat metadata-only container orientation as identity', async () => {
    const file = join(tempDir, 'metadata-only.jxl');
    const buffer = fromHex(`
      00 00 00 0c 4a 58 4c 20 0d 0a 87 0a
      00 00 00 14 66 74 79 70 6a 78 6c 20 00 00 00 00 6a 78 6c 20
      00 00 00 13 6a 78 6c 70 00 00 00 00 ff 0a aa 3d 68 f5 0c 00
      00 05 00 62 72 6f 62 78 6d 6c 20 1b cd 1d 20 2c 0e ec 66 9f
    `);

    await writeFile(file, buffer);

    await expect(readJxlIntrinsicOrientation(file)).resolves.toBe(ExifOrientation.Horizontal);
  });

  it('should find the codestream after large container boxes', async () => {
    const file = join(tempDir, 'delayed-codestream.jxl');
    const signature = fromHex(`00 00 00 0c 4a 58 4c 20 0d 0a 87 0a`);
    const ftyp = fromHex(`00 00 00 14 66 74 79 70 6a 78 6c 20 00 00 00 00 6a 78 6c 20`);
    const largeXml = box('xml ', Buffer.alloc(5000, 0x78));
    const codestream = fromHex(`00 00 00 12 6a 78 6c 70 00 00 00 00 ff 0a c9 2d 10 13 00 00 00 51 6a 62 72 64 c0 70 db 00 82 20 08 2d 03 02 40 62 00 a1`);

    await writeFile(file, Buffer.concat([signature, ftyp, largeXml, codestream]));

    await expect(readJxlIntrinsicOrientation(file)).resolves.toBe(ExifOrientation.Rotate90CW);
  });
});
