
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // result is "data:image/jpeg;base64,..." - we only want the part after the comma
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to read file as Base64 string.'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Converts a File or Blob into a full Base64 Data URL.
 * This is useful for embedding images directly in the DOM or storing them in localStorage.
 * @param file The File or Blob to convert.
 * @returns A promise that resolves with the data URL string (e.g., "data:image/jpeg;base64,...").
 */
export const fileToDataURL = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as Data URL.'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};
