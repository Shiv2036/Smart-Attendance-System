import { GoogleGenAI, Type } from "@google/genai";
import type { Student, GeminiAttendanceResponse } from '../types';
import { fileToBase64 } from '../utils/fileUtils';

const apiKey = process.env.API_KEY;

if (!apiKey) {
  throw new Error("API_KEY is not defined in your environment. Please add it and restart the server.");
}

const ai = new GoogleGenAI({ apiKey });

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    present: {
      type: Type.ARRAY,
      description: "List of students from the roster who are confirmed to be present in the classroom photo.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "The full name of the student, which must match a name from the provided roster.",
          },
          box: {
            type: Type.OBJECT,
            description: "The bounding box coordinates (normalized from 0.0 to 1.0) for the student's face.",
            properties: { top: { type: Type.NUMBER }, right: { type: Type.NUMBER }, bottom: { type: Type.NUMBER }, left: { type: Type.NUMBER } },
            required: ['top', 'right', 'bottom', 'left'],
          },
        },
        required: ['name', 'box'],
      },
    },
    unknown: {
      type: Type.ARRAY,
      description: "List of any faces detected in the classroom photo that do not match any student in the roster.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "This should always be the string 'Unknown'." },
          box: {
            type: Type.OBJECT,
            description: "The bounding box coordinates (normalized from 0.0 to 1.0) for the unknown face.",
            properties: { top: { type: Type.NUMBER }, right: { type: Type.NUMBER }, bottom: { type: Type.NUMBER }, left: { type: Type.NUMBER } },
            required: ['top', 'right', 'bottom', 'left'],
          },
        },
        required: ['name', 'box'],
      },
    },
    absent: {
        type: Type.ARRAY,
        description: "A list of names for all students from the roster who were NOT found in the classroom photo.",
        items: { type: Type.STRING },
    },
    engagementSummary: {
        type: Type.STRING,
        description: "A one-paragraph, qualitative summary of the overall classroom atmosphere, engagement level, and mood based on student postures and expressions. Be objective and descriptive."
    }
  },
  required: ['present', 'unknown', 'absent', 'engagementSummary'],
};

export const takeAttendanceFromImages = async (
  classroomImage: File,
  students: Student[]
): Promise<GeminiAttendanceResponse> => {
    
    const classroomImagePart = { inlineData: { mimeType: classroomImage.type, data: await fileToBase64(classroomImage) } };
    const studentImageParts = students.flatMap(student => [
        { text: `Roster photo for student named: ${student.name}` },
        { inlineData: { mimeType: student.imageType, data: student.imageBase64 } },
    ]);

    const systemInstruction = `
        You are a highly accurate AI assistant specializing in facial recognition for attendance tracking and classroom analysis. 
        Your purpose is to analyze a classroom photo against a roster of student images and return a structured JSON response detailing who is present, who is absent, identifying any unknown individuals, and providing an engagement summary. 
        You must be meticulous and only declare a match with very high confidence.
    `;

    const prompt = `
        Please perform the attendance check and classroom analysis based on the provided classroom image and student roster.

        **Part 1: Attendance Check (High Accuracy Instructions)**
        1.  **Strict Matching:** For each student in the roster, carefully compare their photo with every face in the classroom image. A match should only be made if you have extremely high confidence.
        2.  **Avoid Guesswork:** If a face in the classroom is partially obscured, blurry, or at a difficult angle, and you cannot be certain of a match, DO NOT guess. Mark the student as absent and the face as 'Unknown'.
        3.  **Present Students:** For each high-confidence match, add the student to the 'present' list. Include their exact name and a precise bounding box (normalized from 0 to 1).
        4.  **Unknown Faces:** Any face that does not have a high-confidence match to a roster student must be added to the 'unknown' list. The name for these entries must be 'Unknown', with a bounding box.
        5.  **Absent Students:** After processing all faces, compile a list of names for every student NOT marked as 'present'. This list goes into the 'absent' array.

        **Part 2: Engagement Analysis**
        After the attendance check, provide a brief, one-paragraph summary for the 'engagementSummary' field. Analyze the overall classroom atmosphere, engagement level, and mood.

        Your final output must be ONLY the JSON object that adheres to the provided schema. Do not include any introductory text, markdown, or explanations.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: { parts: [classroomImagePart, ...studentImageParts, { text: prompt }] },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.1,
            }
        });

        const jsonText = response.text.trim();
        const result: GeminiAttendanceResponse = JSON.parse(jsonText);
        
        result.present = result.present.map(p => ({ ...p, id: `face-${p.name}-${Math.random()}` }));
        result.unknown = result.unknown.map(u => ({ ...u, id: `face-unknown-${Math.random()}` }));

        return result;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error && (error.message.includes('API key not valid') || error.message.includes('permission denied'))) {
            throw new Error('The Gemini API key is not valid or has insufficient permissions. Please check your key and try again.');
        }
        throw new Error('Failed to get a valid response from the AI. The model may be unable to process the request. Please try a different photo or check the student roster.');
    }
};

export const identifyUnknownFace = async (
  croppedImageBase64: string,
  mimeType: string,
  absentStudents: Student[]
): Promise<string> => {
  if (absentStudents.length === 0) {
    return "No absent students to match against.";
  }

  const croppedImagePart = { inlineData: { mimeType, data: croppedImageBase64 } };
  const studentNames = absentStudents.map(s => s.name).join(', ');

  const prompt = `
    From the following list of absent students, who is the most likely match for the person in this image?
    Student List: ${studentNames}.
    
    Carefully analyze the image. If you can make a high-confidence guess, respond with ONLY the student's full name.
    If you are not confident, respond with the exact string "Unable to identify".
    Do not add any other text or explanation.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: { parts: [croppedImagePart, { text: prompt }] },
      config: { temperature: 0.1 }
    });
    return response.text.trim();
  } catch (error) {
    console.error("Error calling Gemini API for identification:", error);
    throw new Error("AI identification failed.");
  }
};

export { fileToBase64, fileToDataURL } from '../utils/fileUtils';
export { cropImage } from '../utils/imageUtils';