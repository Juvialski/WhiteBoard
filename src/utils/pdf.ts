import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function pdfToImages(file: File): Promise<{ src: string, width: number, height: number }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const images = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    // Standard viewport at 1.0 scale
    const originalViewport = page.getViewport({ scale: 1.0 });
    
    // Determine scale to keep max dimension reasonable for Firestore (e.g., 1200px)
    const maxDim = 1200;
    const currentMax = Math.max(originalViewport.width, originalViewport.height);
    const scale = currentMax > maxDim ? maxDim / currentMax : 1.5; // Up-res slightly if small, or cap at maxDim
    
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // @ts-ignore
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;

      
      const src = canvas.toDataURL('image/jpeg', 0.6); // heavily compressed JPEG
      images.push({
        src,
        width: viewport.width,
        height: viewport.height
      });
    }
  }
  
  return images;
}
