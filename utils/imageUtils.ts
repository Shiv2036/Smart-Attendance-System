import type { BoundingBox } from '../types';

/**
 * Crops a portion of an image specified by a bounding box.
 * @param imageUrl The Data URL of the source image.
 * @param box The normalized bounding box coordinates (0.0 to 1.0).
 * @returns A promise that resolves with the cropped image as a base64 string and its mime type.
 */
export const cropImage = (
  imageUrl: string,
  box: BoundingBox
): Promise<{ base64: string; dataUrl: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context.'));
      }

      const imageWidth = image.naturalWidth;
      const imageHeight = image.naturalHeight;

      const cropX = box.left * imageWidth;
      const cropY = box.top * imageHeight;
      const cropWidth = (box.right - box.left) * imageWidth;
      const cropHeight = (box.bottom - box.top) * imageHeight;
      
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );
      
      const mimeType = imageUrl.substring(5, imageUrl.indexOf(';')) || 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, 0.9);
      const base64 = dataUrl.split(',')[1];

      resolve({ base64, dataUrl, mimeType });
    };
    image.onerror = (error) => reject(error);
    image.src = imageUrl;
  });
};
