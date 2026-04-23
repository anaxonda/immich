import { open } from 'node:fs/promises';
import { ExifOrientation } from 'src/enum';

const JXL_CONTAINER_SIGNATURE = Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]);
const JXL_CODESTREAM_SIGNATURE = Buffer.from([0xff, 0x0a]);
// Orientation is encoded close to the start of the codestream, so probing the first chunk is enough.
const JXL_CODESTREAM_PROBE_BYTES = 4096;

class BitReader {
  #offset = 0;

  constructor(private readonly buffer: Buffer) {}

  read(bits: number) {
    if (bits < 0 || this.#offset + bits > this.buffer.length * 8) {
      throw new RangeError('Not enough bits');
    }

    let value = 0;
    for (let index = 0; index < bits; index++) {
      const bitOffset = this.#offset + index;
      const byte = this.buffer[bitOffset >> 3];
      const bit = (byte >> (bitOffset & 7)) & 1;
      value |= bit << index;
    }

    this.#offset += bits;
    return value;
  }
}

const widthFromRatio = (height: number, ratio: number) => {
  switch (ratio) {
    case 1:
      return height;
    case 2:
      return Math.floor((height * 12) / 10);
    case 3:
      return Math.floor((height * 4) / 3);
    case 4:
      return Math.floor((height * 3) / 2);
    case 5:
      return Math.floor((height * 16) / 9);
    case 6:
      return Math.floor((height * 5) / 4);
    case 7:
      return height * 2;
    default:
      return 0;
  }
};

const readU32 = (reader: BitReader, constants: number[], bitWidths: number[]) => {
  const choice = reader.read(2);
  const value = constants[choice] ?? 0;
  const width = bitWidths[choice] ?? 0;
  return value + (width ? reader.read(width) : 0);
};

const readSizeHeader = (reader: BitReader) => {
  if (reader.read(1)) {
    const height = (reader.read(5) + 1) << 3;
    const ratio = reader.read(3);
    return widthFromRatio(height, ratio) || ((reader.read(5) + 1) << 3);
  }

  const height = 1 + readU32(reader, [0, 0, 0, 0], [9, 13, 18, 30]);
  const ratio = reader.read(3);
  return widthFromRatio(height, ratio) || (1 + readU32(reader, [0, 0, 0, 0], [9, 13, 18, 30]));
};

export const parseJxlIntrinsicOrientation = (buffer: Buffer): ExifOrientation | null => {
  try {
    const reader = new BitReader(buffer);
    if (reader.read(8) !== JXL_CODESTREAM_SIGNATURE[0] || reader.read(8) !== JXL_CODESTREAM_SIGNATURE[1]) {
      return null;
    }

    readSizeHeader(reader);
    const allDefault = reader.read(1);
    if (allDefault) {
      return ExifOrientation.Horizontal;
    }

    const extraFields = reader.read(1);
    if (!extraFields) {
      return ExifOrientation.Horizontal;
    }

    return (reader.read(3) + 1) as ExifOrientation;
  } catch {
    return null;
  }
};

const collectJxlCodestreamHeader = (input: Buffer, limit = JXL_CODESTREAM_PROBE_BYTES) => {
  if (input.subarray(0, JXL_CONTAINER_SIGNATURE.length).equals(JXL_CONTAINER_SIGNATURE)) {
    const output = Buffer.alloc(limit);
    let copied = 0;
    let offset = JXL_CONTAINER_SIGNATURE.length;
    let lastCodestreamBox = false;

    while (offset + 8 <= input.length && copied < limit && !lastCodestreamBox) {
      let headSize = 8;
      let size = input.readUInt32BE(offset);
      offset += 4;

      if (size === 1) {
        if (offset + 12 > input.length) {
          return null;
        }

        size = Number(input.readBigUInt64BE(offset));
        offset += 8;
        headSize = 16;
      }

      if (size && size <= headSize) {
        return null;
      }

      const type = input.toString('ascii', offset, offset + 4);
      offset += 4;
      let payloadSize = size ? size - headSize : input.length - offset;

      if (type === 'jxlp') {
        if (payloadSize < 4 || offset + 4 > input.length) {
          return null;
        }

        const index = input.readUInt32BE(offset);
        if (index >= 0x8000_0000) {
          lastCodestreamBox = true;
        }

        offset += 4;
        payloadSize -= 4;
      } else if (type === 'jxlc') {
        lastCodestreamBox = true;
      }

      if (payloadSize < 0 || offset + payloadSize > input.length) {
        payloadSize = Math.max(0, input.length - offset);
      }

      if (type === 'jxlc' || type === 'jxlp') {
        const bytesToCopy = Math.min(payloadSize, limit - copied);
        input.copy(output, copied, offset, offset + bytesToCopy);
        copied += bytesToCopy;
      }

      offset += payloadSize;
    }

    return copied > 0 ? output.subarray(0, copied) : null;
  }

  if (input.subarray(0, JXL_CODESTREAM_SIGNATURE.length).equals(JXL_CODESTREAM_SIGNATURE)) {
    return input;
  }

  return null;
};

export const readJxlIntrinsicOrientation = async (path: string): Promise<ExifOrientation | null> => {
  const file = await open(path, 'r');

  try {
    const buffer = Buffer.alloc(JXL_CODESTREAM_PROBE_BYTES);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const codestreamHeader = collectJxlCodestreamHeader(buffer.subarray(0, bytesRead));
    return codestreamHeader ? parseJxlIntrinsicOrientation(codestreamHeader) : null;
  } catch {
    return null;
  } finally {
    await file.close();
  }
};
