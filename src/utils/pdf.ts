import * as pdfjsLib from 'pdfjs-dist';

// Need to set the workerSrc for pdfjs to work in browser.
// We'll use the CDN link that matches the installed version, or just the local vite worker if possible.
// A common approach for Vite + pdfjs is to use the CDN.
const PDFJS_VERSION = '3.11.174'; // fallback
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || PDFJS_VERSION}/pdf.worker.min.js`;

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
