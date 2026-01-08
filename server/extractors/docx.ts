import mammoth from 'mammoth';

/**
 * Extract text from a DOCX file buffer
 * @param buffer - Node Buffer, ArrayBuffer, or Uint8Array
 * @returns Extracted text string
 */
export async function extractDocxText(buffer: Buffer | ArrayBuffer | Uint8Array): Promise<string> {
  // Convert to Node Buffer if needed
  let nodeBuffer: Buffer;
  if (Buffer.isBuffer(buffer)) {
    nodeBuffer = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    nodeBuffer = Buffer.from(buffer);
  } else if (buffer instanceof Uint8Array) {
    nodeBuffer = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    nodeBuffer = Buffer.from(buffer as any);
  }
  
  try {
    const result = await mammoth.extractRawText({ buffer: nodeBuffer });
    return (result.value || '').trim();
  } catch (error: any) {
    throw new Error(`DOCX extraction failed: ${error?.message || String(error)}`);
  }
}

