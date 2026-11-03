/**
 * Reads the text in a screenshot, on the device. Loaded only when someone
 * actually picks a screenshot, since the reader is several megabytes.
 */
export async function readScreenshot(file: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
