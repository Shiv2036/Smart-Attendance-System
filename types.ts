export interface Student {
  id: string;
  name: string;
  rollNumber: string;
  password?: string; // New: For student login
  imageBase64: string;
  imageType: string;
  imageUrl: string; // Used for display (Object URL or Data URL)
}

export interface Classroom {
  id: string;
  name: string;
  students: Student[];
}

export enum AttendanceStatus {
  Present = 'Present',
  Absent = 'Absent',
}

export interface AttendanceRecord {
  studentId: string; // Link back to the student
  name: string;
  rollNumber: string;
  status: AttendanceStatus;
}

export interface BoundingBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DetectedFace {
  id: string; // Unique ID for React key prop
  name: string;
  box: BoundingBox;
}

export interface GeminiAttendanceResponse {
    present: DetectedFace[];
    unknown: DetectedFace[];
    absent: string[];
    engagementSummary: string; // New field for engagement analysis
}

// New interface for storing historical reports
export interface AttendanceReport {
  id: string;
  classroomId: string;
  classroomName: string;
  date: string; // ISO string for the date and time of capture
  period: string; // Label for the session, e.g., "Period 1", "Math"
  attendance: AttendanceRecord[];
  capturedImageAsDataUrl: string; // Stored as a base64 data URL
  detectedFaces: DetectedFace[];
  engagementSummary: string; // New field for engagement analysis
}