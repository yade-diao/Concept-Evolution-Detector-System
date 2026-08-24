/**
 * A reader for the MATLAB Level 5 `.mat` files the benchmarks ship as.
 *
 * The datasets are not bundled with the application: the manifest holds a URL
 * per benchmark, the browser downloads the `.mat` once and caches it, and this
 * is what turns those bytes into a matrix. It exists because every benchmark in
 * this field is published as a `.mat` and none of them as anything else.
 *
 * Only what those files actually use is implemented: numeric, non-sparse, real
 * arrays, little-endian, most of them zlib-compressed. Anything else - a struct,
 * a cell, a complex array - is refused by name rather than half-read.
 *
 * Format reference: MAT-File Format, R2023b, section "Level 5 MAT-File Format".
 */

/** One numeric array out of a `.mat` file, row-major. */
export interface MatArray {
  name: string
  rows: number
  cols: number
  /** Row-major; MATLAB stores column-major and the transpose happens here. */
  data: Float64Array
}

// Data types, from the MAT-file specification's Table 1-1.
const MI_INT8 = 1
const MI_UINT8 = 2
const MI_INT16 = 3
const MI_UINT16 = 4
const MI_INT32 = 5
const MI_UINT32 = 6
const MI_SINGLE = 7
const MI_DOUBLE = 9
const MI_INT64 = 12
const MI_UINT64 = 13
const MI_MATRIX = 14
const MI_COMPRESSED = 15
const MI_UTF8 = 16

// Array classes, from Table 1-3. Anything below mxDOUBLE_CLASS is a container.
const MX_CHAR_CLASS = 4
const MX_SPARSE_CLASS = 5
const MX_DOUBLE_CLASS = 6

const CLASS_NAMES: Record<number, string> = {
  1: 'cell', 2: 'struct', 3: 'object', 4: 'char', 5: 'sparse',
}

interface Element {
  type: number
  /** The payload, without the tag and without the padding after it. */
  bytes: Uint8Array
  /** Offset of the next element, padding already skipped. */
  next: number
}

/**
 * One tagged element.
 *
 * The tag has two encodings. Normally it is two 32-bit words, type then length;
 * but when the payload is four bytes or fewer MATLAB packs the length into the
 * top half of the first word and the payload into the second, and the whole
 * element is eight bytes. Both appear in these files - the small form carries
 * the array flags and the dimensions.
 */
function readElement(view: DataView, offset: number): Element {
  const first = view.getUint32(offset, true)
  const packedLength = first >>> 16

  if (packedLength !== 0) {
    const type = first & 0xffff
    const start = offset + 4
    return {
      type,
      bytes: new Uint8Array(view.buffer, view.byteOffset + start, packedLength),
      next: offset + 8,
    }
  }

  const length = view.getUint32(offset + 4, true)
  const start = offset + 8
  // Every element is padded out to an eight-byte boundary.
  const padded = length + ((8 - (length % 8)) % 8)
  return {
    type: first,
    bytes: new Uint8Array(view.buffer, view.byteOffset + start, length),
    next: start + padded,
  }
}

/** Widen a numeric payload to float64, whatever it was stored as. */
function toFloat64(type: number, bytes: Uint8Array): Float64Array {
  // A copy, because the slice is a view onto a buffer whose alignment the typed
  // array constructors do not accept: `bytes.byteOffset` is only 8-byte aligned
  // by luck.
  const buffer = bytes.slice().buffer
  switch (type) {
    case MI_DOUBLE: return new Float64Array(buffer)
    case MI_SINGLE: return Float64Array.from(new Float32Array(buffer))
    case MI_INT8: return Float64Array.from(new Int8Array(buffer))
    case MI_UINT8: return Float64Array.from(new Uint8Array(buffer))
    case MI_INT16: return Float64Array.from(new Int16Array(buffer))
    case MI_UINT16: return Float64Array.from(new Uint16Array(buffer))
    case MI_INT32: return Float64Array.from(new Int32Array(buffer))
    case MI_UINT32: return Float64Array.from(new Uint32Array(buffer))
    case MI_INT64: return Float64Array.from(new BigInt64Array(buffer), Number)
    case MI_UINT64: return Float64Array.from(new BigUint64Array(buffer), Number)
    default:
      throw new Error(`unsupported .mat data type ${type}`)
  }
}

function decodeName(element: Element): string {
  const decoder = new TextDecoder(element.type === MI_UTF8 ? 'utf-8' : 'latin1')
  return decoder.decode(element.bytes)
}

/** One `miMATRIX` element: flags, dimensions, name, then the values. */
function readMatrix(bytes: Uint8Array): MatArray {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const flags = readElement(view, 0)
  const flagWords = new Uint32Array(flags.bytes.slice().buffer)
  const arrayClass = flagWords[0] & 0xff
  const complex = (flagWords[0] & 0x0800) !== 0

  if (arrayClass === MX_SPARSE_CLASS || arrayClass < MX_DOUBLE_CLASS) {
    const name = CLASS_NAMES[arrayClass] ?? `class ${arrayClass}`
    throw new Error(
      `this .mat holds a ${name} array; the benchmarks are plain numeric matrices`)
  }
  if (arrayClass === MX_CHAR_CLASS) throw new Error('this .mat holds text, not a matrix')
  if (complex) throw new Error('this .mat holds a complex array; the benchmarks are real')

  const dimensions = readElement(view, flags.next)
  const dims = new Int32Array(dimensions.bytes.slice().buffer)
  if (dims.length !== 2) {
    throw new Error(`expected a 2-D array, got ${dims.length} dimensions`)
  }
  const rows = dims[0]
  const cols = dims[1]

  const nameElement = readElement(view, dimensions.next)
  const real = readElement(view, nameElement.next)
  const values = toFloat64(real.type, real.bytes)

  if (values.length !== rows * cols) {
    throw new Error(
      `${rows}x${cols} needs ${rows * cols} values, the file holds ${values.length}`)
  }

  // MATLAB writes column-major; everything downstream indexes row-major.
  const data = new Float64Array(rows * cols)
  for (let c = 0; c < cols; c++) {
    const column = c * rows
    for (let r = 0; r < rows; r++) data[r * cols + c] = values[column + r]
  }

  return { name: decodeName(nameElement), rows, cols, data }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  // zlib-wrapped deflate, which is what MATLAB's miCOMPRESSED is. Response is
  // used rather than iterating the stream: async iteration over a ReadableStream
  // is not available in every browser this has to run in.
  const stream = new Blob([bytes as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Every numeric array in a `.mat` file.
 *
 * Asynchronous because the payloads are compressed and the only inflate
 * available to both a browser and a test runner without a dependency is
 * `DecompressionStream`.
 */
export async function readMat(source: ArrayBuffer | Uint8Array): Promise<MatArray[]> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source)
  if (bytes.byteLength < 128) throw new Error('not a .mat file: shorter than its header')

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // Bytes 126-127 read "IM" on a little-endian file and "MI" on a big-endian
  // one. Every benchmark here is the former, and guessing at the latter is worse
  // than saying so.
  const endian = String.fromCharCode(bytes[126], bytes[127])
  if (endian !== 'IM') {
    throw new Error(`unsupported .mat byte order ${JSON.stringify(endian)}; expected "IM"`)
  }

  const arrays: MatArray[] = []
  let offset = 128
  while (offset + 8 <= bytes.byteLength) {
    const element = readElement(view, offset)
    if (element.type === MI_COMPRESSED) {
      const inner = await inflate(element.bytes)
      const innerView = new DataView(inner.buffer, inner.byteOffset, inner.byteLength)
      const matrix = readElement(innerView, 0)
      if (matrix.type === MI_MATRIX) arrays.push(readMatrix(matrix.bytes))
    } else if (element.type === MI_MATRIX) {
      arrays.push(readMatrix(element.bytes))
    }
    offset = element.next
  }
  return arrays
}

/**
 * The one array a benchmark file holds.
 *
 * The benchmarks are one variable per file. A file with several is a different
 * file than the one this expects, so it is refused rather than guessed at.
 */
export async function readSingleArray(source: ArrayBuffer | Uint8Array): Promise<MatArray> {
  const arrays = await readMat(source)
  if (arrays.length !== 1) {
    const names = arrays.map((a) => a.name).join(', ')
    throw new Error(`expected one array, found ${arrays.length} (${names})`)
  }
  return arrays[0]
}
