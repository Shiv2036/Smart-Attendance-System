

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Student, AttendanceRecord, DetectedFace, Classroom, AttendanceReport } from './types';
import { AttendanceStatus } from './types';
import { takeAttendanceFromImages, fileToBase64, fileToDataURL, identifyUnknownFace, cropImage } from './services/geminiService';

type LoggedInUser = {
  role: 'teacher' | 'student';
  studentId?: string;
  classroomId?: string; // To find the student faster
};


// =================================================================================
// Main App Component - Manages state and routing between views
// =================================================================================
const App: React.FC = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [attendanceReports, setAttendanceReports] = useState<AttendanceReport[]>([]);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // --- DATA PERSISTENCE ---
  useEffect(() => {
    try {
      const userJson = sessionStorage.getItem('loggedInUser');
      if (userJson) setLoggedInUser(JSON.parse(userJson));
      
      const savedClassroomsJSON = localStorage.getItem('classrooms');
      if (savedClassroomsJSON) {
        const loadedClassrooms: Classroom[] = JSON.parse(savedClassroomsJSON).map((c: any) => ({ ...c, students: c.students.map((s: any) => ({ ...s, imageUrl: `data:${s.imageType};base64,${s.imageBase64}` })) }));
        setClassrooms(loadedClassrooms);
      }
      const savedReportsJSON = localStorage.getItem('attendanceReports');
      if (savedReportsJSON) setAttendanceReports(JSON.parse(savedReportsJSON));
    } catch (err) { console.error("Failed to load data", err); setGlobalError("Could not load saved data."); }
    finally { setIsInitialized(true); }
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    try {
      // Don't save student passwords to local storage for security simulation
      const dataToSave = classrooms.map(c => ({ ...c, students: c.students.map(({ password, imageUrl, ...rest }) => rest) }));
      localStorage.setItem('classrooms', JSON.stringify(dataToSave));
      localStorage.setItem('attendanceReports', JSON.stringify(attendanceReports));
    } catch (err) { console.error("Failed to save data to localStorage", err); setGlobalError("Could not save your changes."); }
  }, [classrooms, attendanceReports, isInitialized]);

  // --- AUTH LOGIC ---
  const handleLogin = (user: LoggedInUser) => {
    sessionStorage.setItem('loggedInUser', JSON.stringify(user));
    setLoggedInUser(user);
  };
  const handleLogout = () => {
    sessionStorage.removeItem('loggedInUser');
    setLoggedInUser(null);
  };

  if (!isInitialized) {
      return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg"/></div>;
  }
  
  if (globalError) {
      return <div className="min-h-screen flex items-center justify-center p-4"><ErrorMessage message={globalError} /></div>;
  }

  if (!loggedInUser) {
    return <LoginPage classrooms={classrooms} onLogin={handleLogin} />;
  }

  if (loggedInUser.role === 'teacher') {
    return (
      <TeacherDashboard
        classrooms={classrooms}
        setClassrooms={setClassrooms}
        attendanceReports={attendanceReports}
        setAttendanceReports={setAttendanceReports}
        onLogout={handleLogout}
      />
    );
  }

  if (loggedInUser.role === 'student' && loggedInUser.studentId && loggedInUser.classroomId) {
    return (
      <StudentDashboard
        studentId={loggedInUser.studentId}
        classroomId={loggedInUser.classroomId}
        classrooms={classrooms}
        reports={attendanceReports}
        onLogout={handleLogout}
      />
    );
  }
  
  return <div className="min-h-screen flex items-center justify-center p-4"><ErrorMessage message="Invalid user session. Please log out and try again." /></div>;
};

// =================================================================================
// Login Page Component
// =================================================================================
const LoginPage: React.FC<{ classrooms: Classroom[]; onLogin: (user: LoggedInUser) => void; }> = ({ classrooms, onLogin }) => {
    const [libraryId, setLibraryId] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'teacher' | 'student' | ''>('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!role) {
            setError('Please select your role.');
            return;
        }

        if (role === 'teacher') {
            if (libraryId.toLowerCase() === 'teacher' && password === 'password123') {
                onLogin({ role: 'teacher' });
                return;
            }
        } else if (role === 'student') {
            for (const classroom of classrooms) {
                const student = classroom.students.find(s => s.rollNumber === libraryId && s.password === password);
                if (student) {
                    onLogin({ role: 'student', studentId: student.id, classroomId: classroom.id });
                    return;
                }
            }
        }
        setError('Invalid credentials. Please check your details and try again.');
    };

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-[#0f172a] via-[#0c132b] to-[#080516] text-slate-200 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Starry background */}
            <div className="absolute inset-0 z-0 opacity-50 pointer-events-none">
                {[...Array(150)].map((_, i) => {
                    const size = Math.random() * 2 + 1;
                    const style = {
                        width: `${size}px`,
                        height: `${size}px`,
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 10}s`,
                        animationDuration: `${Math.random() * 10 + 10}s`,
                    };
                    return <div key={i} className="absolute bg-white rounded-full animate-twinkle" style={style}></div>;
                })}
            </div>
            <style>{`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.3; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
                .animate-twinkle {
                    animation: twinkle linear infinite;
                }
            `}</style>

            <div className="w-full max-w-sm bg-slate-900/30 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-slate-700/50 z-10">
                <h1 className="text-2xl font-bold text-center text-white tracking-wide mb-2">Smart Attendance System</h1>
                <p className="text-center text-slate-400 text-sm mb-8">Sign in to your account</p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="libraryId" className="block text-sm font-medium text-slate-300 mb-1.5">Library ID</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4.25 3A1.25 1.25 0 003 4.25v11.5A1.25 1.25 0 004.25 17h11.5A1.25 1.25 0 0017 15.75V4.25A1.25 1.25 0 0015.75 3H4.25zM4 15.75V4.25a.25.25 0 01.25-.25h11.5a.25.25 0 01.25.25v11.5a.25.25 0 01-.25.25H4.25a.25.25 0 01-.25-.25z"/><path d="M6 6.75A.75.75 0 016.75 6h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 016 6.75zM6 9.75A.75.75 0 016.75 9h3.5a.75.75 0 010 1.5h-3.5A.75.75 0 016 9.75z"/></svg>
                            </span>
                            <input
                                id="libraryId" type="text" placeholder="2327CSE1250"
                                value={libraryId} onChange={e => setLibraryId(e.target.value)}
                                className="w-full bg-indigo-100/90 border border-transparent rounded-lg py-2.5 pl-11 pr-4 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                required
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                         <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                            </span>
                             <select
                                id="role" value={role} onChange={e => setRole(e.target.value as 'teacher' | 'student')}
                                className={`w-full bg-indigo-100/90 border border-transparent rounded-lg py-2.5 pl-11 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all appearance-none ${!role && 'text-slate-500'}`}
                                required
                            >
                                <option value="" disabled>---Select your role---</option>
                                <option value="teacher" className="text-slate-900">Teacher</option>
                                <option value="student" className="text-slate-900">Student</option>
                            </select>
                            <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 pointer-events-none">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </span>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                            </span>
                            <input
                                id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                                value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-indigo-100/90 border border-transparent rounded-lg py-2.5 pl-11 pr-10 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                required
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-800" aria-label="Toggle password visibility">
                                {showPassword ? 
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg> :
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414L18.434 16.5A10.02 10.02 0 0110 17c-4.478 0-8.268-2.943-9.542-7 .94-2.45 3.037-4.425 5.766-5.497L3.707 2.293zM10 12a2 2 0 100-4 2 2 0 000 4z" /><path d="M10 3a9.958 9.958 0 00-4.512 1.074l1.65 1.65A5.98 5.98 0 0110 5c2.485 0 4.686 1.343 6.042 3.535l-1.65-1.65A9.958 9.958 0 0010 3z" /></svg>
                                }
                            </button>
                        </div>
                    </div>
                    
                    {error && <p className="text-red-400 text-sm text-center -my-2">{error}</p>}
                    
                    <button type="submit" className="w-full py-3 mt-2 px-4 font-bold rounded-lg transition-all duration-300 bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        <span>Sign in</span>
                    </button>
                </form>
            </div>
        </div>
    );
};


// =================================================================================
// Dashboard Theming and Layout
// =================================================================================
const DashboardContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-200 via-sky-50 to-blue-200 text-slate-800 p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans">
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        {[...Array(50)].map((_, i) => {
          const size = Math.random() * 40 + 20;
          const style = {
            width: `${size}px`,
            height: `${size}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 20}s`,
            animationDuration: `${Math.random() * 20 + 20}s`,
          };
          return <div key={i} className="absolute bg-white/50 rounded-full animate-float" style={style}></div>;
        })}
      </div>
      <style>{`
          @keyframes float {
              0%, 100% { transform: translateY(0) scale(1); opacity: 0.7; }
              50% { transform: translateY(-30px) scale(1.1); opacity: 1; }
          }
          .animate-float {
              animation: float linear infinite;
          }
      `}</style>
      <div className="relative z-10">{children}</div>
    </div>
  );
};

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/50 shadow-lg ${className}`}>
    {children}
  </div>
);


// =================================================================================
// Teacher Dashboard Component - The original app
// =================================================================================
const TeacherDashboard: React.FC<{
    classrooms: Classroom[];
    setClassrooms: React.Dispatch<React.SetStateAction<Classroom[]>>;
    attendanceReports: AttendanceReport[];
    setAttendanceReports: React.Dispatch<React.SetStateAction<AttendanceReport[]>>;
    onLogout: () => void;
}> = ({ classrooms, setClassrooms, attendanceReports, setAttendanceReports, onLogout }) => {
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<AttendanceReport | null>(null);
  const [periodName, setPeriodName] = useState('');
  const [classroomPhoto, setClassroomPhoto] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [identifyingFace, setIdentifyingFace] = useState<{ face: DetectedFace; suggestion: string | null; image: string; } | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);

  const selectedClassroom = useMemo(() => classrooms.find(c => c.id === selectedClassroomId), [classrooms, selectedClassroomId]);
  const students = useMemo(() => selectedClassroom?.students ?? [], [selectedClassroom]);
  const classroomReports = useMemo(() => attendanceReports.filter(r => r.classroomId === selectedClassroomId), [attendanceReports, selectedClassroomId]);

  const handleAddClassroom = (name: string) => setClassrooms(prev => [...prev, { id: `class-${Date.now()}`, name, students: [] }]);
  
  const handleDeleteClassroom = (id: string) => {
    if (window.confirm('Are you sure you want to delete this classroom and all its data?')) {
      setClassrooms(prev => prev.filter(c => c.id !== id));
      setAttendanceReports(prev => prev.filter(r => r.classroomId !== id));
      if (selectedClassroomId === id) { setSelectedClassroomId(null); setActiveReport(null); }
    }
  };
  
  const handleUpdateClassroom = (id: string, newName: string) => {
    if (!newName.trim()) {
      setError("Classroom name cannot be empty.");
      return;
    }
    setClassrooms(prev => prev.map(c => c.id === id ? { ...c, name: newName.trim() } : c));
  };
  
  const handleSelectClassroom = (id: string) => {
    setSelectedClassroomId(id);
    setActiveReport(null); setError(null); setPeriodName(''); setClassroomPhoto(null);
  };
  
  const handleAddStudent = async (name: string, rollNumber: string, password: string, file: File) => {
    if (!selectedClassroomId) return;
    const imageBase64 = await fileToBase64(file);
    const newStudent: Student = { id: `student-${Date.now()}`, name, rollNumber, password, imageBase64, imageType: file.type, imageUrl: URL.createObjectURL(file) };
    setClassrooms(prev => prev.map(c => c.id === selectedClassroomId ? { ...c, students: [...c.students, newStudent].sort((a, b) => a.name.localeCompare(b.name)) } : c));
  };
  
  const handleUpdateStudent = (studentId: string, updatedData: { name: string; rollNumber: string; password?: string }) => {
    if (!selectedClassroomId) return;
    setClassrooms(prev =>
      prev.map(c => {
        if (c.id === selectedClassroomId) {
          const updatedStudents = c.students.map(s => {
            if (s.id === studentId) {
              const updatedStudent = { ...s, name: updatedData.name, rollNumber: updatedData.rollNumber };
              if (updatedData.password) {
                updatedStudent.password = updatedData.password;
              }
              return updatedStudent;
            }
            return s;
          }).sort((a, b) => a.name.localeCompare(b.name));
          return { ...c, students: updatedStudents };
        }
        return c;
      })
    );
    setEditingStudent(null);
  };

  const removeStudent = (studentId: string) => {
    if (!selectedClassroomId) return;
    setClassrooms(prev => prev.map(c => c.id === selectedClassroomId ? { ...c, students: c.students.filter(s => s.id !== studentId) } : c));
  };
  
  const handleTakeAttendance = useCallback(async (imageFile: File, period: string) => {
    if (!imageFile || !selectedClassroom || students.length === 0 || !period) {
      setError('Please select a classroom, provide a period name, and ensure the roster has students.'); return;
    }
    setIsLoading(true); setError(null); setActiveReport(null);
    try {
      const result = await takeAttendanceFromImages(imageFile, students);
      const presentNames = new Set(result.present.map(p => p.name));
      const finalAttendance = students.map(student => ({
        studentId: student.id, name: student.name, rollNumber: student.rollNumber,
        status: presentNames.has(student.name) ? AttendanceStatus.Present : AttendanceStatus.Absent
      })).sort((a, b) => a.name.localeCompare(b.name));
      
      const newReport: AttendanceReport = {
        id: `report-${Date.now()}`, classroomId: selectedClassroom.id, classroomName: selectedClassroom.name,
        date: new Date().toISOString(), period, attendance: finalAttendance,
        capturedImageAsDataUrl: await fileToDataURL(imageFile),
        detectedFaces: [...result.present, ...result.unknown],
        engagementSummary: result.engagementSummary
      };
      
      setAttendanceReports(prev => [newReport, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setActiveReport(newReport); setPeriodName(''); setClassroomPhoto(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'An unknown error occurred.'); } 
    finally { setIsLoading(false); }
  }, [students, selectedClassroom, setAttendanceReports]);

  const handleStatusChange = (studentId: string, reportId: string) => {
    setAttendanceReports(prevReports => {
      const newReports = prevReports.map(report => {
        if (report.id === reportId) {
          const newAttendance = report.attendance.map(record => record.studentId === studentId ? { ...record, status: record.status === AttendanceStatus.Present ? AttendanceStatus.Absent : AttendanceStatus.Present } : record);
          const updatedReport = { ...report, attendance: newAttendance };
          if(activeReport?.id === reportId) setActiveReport(updatedReport);
          return updatedReport;
        }
        return report;
      });
      return newReports;
    });
  };

  const handleIdentifyClick = async (face: DetectedFace) => {
    if (!activeReport) return;
    setIsIdentifying(true); setError(null);
    try {
      const { dataUrl, base64, mimeType } = await cropImage(activeReport.capturedImageAsDataUrl, face.box);
      const absentStudentNames = new Set(activeReport.attendance.filter(r => r.status === AttendanceStatus.Absent).map(r => r.name));
      const absentStudents = students.filter(s => absentStudentNames.has(s.name));
      const suggestion = await identifyUnknownFace(base64, mimeType, absentStudents);
      setIdentifyingFace({ face, suggestion, image: dataUrl });
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to crop or identify face.'); }
    finally { setIsIdentifying(false); }
  };

  const handleSuggestionConfirm = (suggestedName: string, faceId: string) => {
    const student = students.find(s => s.name === suggestedName);
    if (student && activeReport) {
        handleStatusChange(student.id, activeReport.id);
        const updatedReport = { ...activeReport, detectedFaces: activeReport.detectedFaces.map(f => f.id === faceId ? {...f, name: student.name} : f) };
        setActiveReport(updatedReport);
        setAttendanceReports(prev => prev.map(r => r.id === activeReport.id ? updatedReport : r));
    }
    setIdentifyingFace(null);
  };

  const handleGenerateReport = () => {
    if (!classroomPhoto) { setError('Please upload a classroom photo.'); return; }
    if (!periodName.trim()) { setError('Please enter a period or subject name.'); return; }
    handleTakeAttendance(classroomPhoto, periodName.trim());
  };
  
  const canTakeAttendance = useMemo(() => selectedClassroom && students.length > 0 && !isLoading, [selectedClassroom, students, isLoading]);

  return (
    <DashboardContainer>
      {viewingStudent && <StudentProfileModal student={viewingStudent} reports={classroomReports} onClose={() => setViewingStudent(null)} />}
      {editingStudent && <EditStudentModal student={editingStudent} onClose={() => setEditingStudent(null)} onSave={handleUpdateStudent} />}
      {identifyingFace && <SuggestionModal result={identifyingFace} onConfirm={handleSuggestionConfirm} onClose={() => setIdentifyingFace(null)} />}
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-12 relative">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-sky-900/80">Teacher Dashboard</h1>
          <p className="mt-4 text-lg text-slate-600 max-w-3xl mx-auto">Manage classrooms, take attendance, and gain classroom insights.</p>
           <button onClick={onLogout} className="absolute top-0 right-0 py-2 px-4 font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm">Logout</button>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="flex flex-col gap-8">
            <SetupManager
              classrooms={classrooms} selectedClassroomId={selectedClassroomId} onAddClassroom={handleAddClassroom}
              onDeleteClassroom={handleDeleteClassroom} onSelectClassroom={handleSelectClassroom} onUpdateClassroom={handleUpdateClassroom}
              onAddStudent={handleAddStudent} onRemoveStudent={removeStudent} onViewStudent={setViewingStudent} onEditStudent={setEditingStudent}
              setError={setError} isLoading={isLoading}
            />
            <AttendanceCapturePanel periodName={periodName} setPeriodName={setPeriodName} classroomPhoto={classroomPhoto} setClassroomPhoto={setClassroomPhoto} onGenerateReport={handleGenerateReport} canCapture={canTakeAttendance} isLoading={isLoading} selectedClassroomName={selectedClassroom?.name} />
          </div>
          <div className="lg:sticky top-8 self-start">
            <ReportPanel
              activeReport={activeReport} isLoading={isLoading} error={error} totalStudents={students.length}
              classroomName={selectedClassroom?.name} reports={classroomReports} onSelectReport={setActiveReport}
              activeReportId={activeReport?.id} onStatusChange={handleStatusChange} onIdentifyClick={handleIdentifyClick} isIdentifying={isIdentifying}
            />
          </div>
        </main>
      </div>
    </DashboardContainer>
  );
};

// =================================================================================
// Student Dashboard Component - New
// =================================================================================
const StudentDashboard: React.FC<{
    studentId: string;
    classroomId: string;
    classrooms: Classroom[];
    reports: AttendanceReport[];
    onLogout: () => void;
}> = ({ studentId, classroomId, classrooms, reports, onLogout }) => {
    const student = useMemo(() => {
        const classroom = classrooms.find(c => c.id === classroomId);
        return classroom?.students.find(s => s.id === studentId);
    }, [studentId, classroomId, classrooms]);

    const studentRecords = useMemo(() => {
        return reports
            .filter(r => r.classroomId === classroomId)
            .map(r => ({
                reportId: r.id,
                period: r.period,
                date: r.date,
                record: r.attendance.find(a => a.studentId === studentId)
            }))
            .filter(item => item.record)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [reports, studentId, classroomId]);

    if (!student) {
        return <div className="min-h-screen flex items-center justify-center p-4"><ErrorMessage message="Could not find student profile. Please log out and try again." /></div>;
    }

    return (
        <DashboardContainer>
            <div className="max-w-4xl mx-auto">
                <header className="text-center mb-12 relative">
                    <h1 className="text-4xl sm:text-5xl font-bold text-sky-900/80">Student Dashboard</h1>
                    <p className="mt-3 text-lg text-slate-600">Welcome, {student.name}!</p>
                    <button onClick={onLogout} className="absolute top-0 right-0 py-2 px-4 font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm">Logout</button>
                </header>
                <main className="space-y-8">
                    <Panel className="flex items-center gap-6">
                        <img src={student.imageUrl} alt={student.name} className="w-24 h-24 rounded-full object-cover border-4 border-white/80" />
                        <div>
                            <h2 className="text-3xl font-bold text-slate-800">{student.name}</h2>
                            <p className="text-slate-500 text-lg">Library ID: {student.rollNumber}</p>
                        </div>
                    </Panel>
                    <Panel>
                        <h3 className="text-2xl font-bold mb-4 text-slate-800">Attendance History</h3>
                        {studentRecords.length > 0 ? (
                            <div className="max-h-96 overflow-y-auto pr-2">
                                <ul className="space-y-3">
                                    {studentRecords.map(({ reportId, period, date, record }) => (
                                        <li key={reportId} className="flex justify-between items-center p-4 bg-sky-50/50 rounded-lg border border-sky-100/80">
                                            <div className="text-sm">
                                                <p className="font-semibold text-base text-slate-700">{period}</p>
                                                <p className="text-xs text-slate-500">{new Date(date).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${record?.status === AttendanceStatus.Present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{record?.status}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-center text-slate-500 py-8">No attendance records found for you yet.</p>
                        )}
                    </Panel>
                </main>
            </div>
        </DashboardContainer>
    );
};



// --- Child Components (for Teacher Dashboard) ---

const SetupManager: React.FC<{
    classrooms: Classroom[]; selectedClassroomId: string | null; isLoading: boolean;
    onAddClassroom: (name: string) => void; onDeleteClassroom: (id: string) => void; onSelectClassroom: (id: string) => void;
    onUpdateClassroom: (id: string, newName: string) => void;
    onAddStudent: (name: string, rollNumber: string, password: string, file: File) => Promise<void>; onRemoveStudent: (id: string) => void;
    onViewStudent: (student: Student) => void; onEditStudent: (student: Student) => void; setError: (msg: string | null) => void;
}> = (props) => {
    const { classrooms, selectedClassroomId, onAddClassroom, onDeleteClassroom, onSelectClassroom, onUpdateClassroom, onAddStudent, onRemoveStudent, onViewStudent, onEditStudent, setError, isLoading } = props;
    const selectedClassroom = classrooms.find(c => c.id === selectedClassroomId);

    return (
        <Panel>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">Management</h3>
            </div>
            <ClassroomManager classrooms={classrooms} selectedId={selectedClassroomId} onAdd={onAddClassroom} onDelete={onDeleteClassroom} onSelect={onSelectClassroom} onUpdate={onUpdateClassroom} isDisabled={isLoading}/>
            
            {selectedClassroom && (
                <div className="mt-6 pt-6 border-t border-sky-200/80 animate-fade-in">
                    <h4 className="text-lg font-semibold text-slate-700 mb-4">Roster for {selectedClassroom.name}</h4>
                    <AddStudentForm onAddStudent={onAddStudent} setError={setError} isDisabled={isLoading} />
                    <StudentList students={selectedClassroom.students} onRemove={onRemoveStudent} onView={onViewStudent} onEdit={onEditStudent}/>
                </div>
            )}
        </Panel>
    );
};

const AttendanceCapturePanel: React.FC<{
    periodName: string; setPeriodName: (name: string) => void; classroomPhoto: File | null; setClassroomPhoto: (file: File | null) => void;
    onGenerateReport: () => void; canCapture: boolean; isLoading: boolean; selectedClassroomName?: string;
}> = ({ periodName, setPeriodName, classroomPhoto, setClassroomPhoto, onGenerateReport, canCapture, isLoading, selectedClassroomName }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) setClassroomPhoto(e.target.files[0]); };
    const canGenerate = canCapture && !!classroomPhoto && periodName.trim() && !isLoading;

    return (
        <Panel className={`${!canCapture ? 'opacity-50' : ''} animate-fade-in`}>
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-800 mb-5">Take Attendance</h3>
            <div className={!canCapture ? 'cursor-not-allowed' : ''}>
                <p className="text-sm text-slate-600 mb-4">{canCapture ? `Ready to take attendance for ${selectedClassroomName}.` : 'Select a classroom with students to begin.'}</p>
                <div className="space-y-4">
                    <input type="text" placeholder="Enter Period/Subject Name" value={periodName} onChange={e => setPeriodName(e.target.value)} className="w-full bg-sky-50/80 border border-sky-300/80 rounded-lg py-2.5 px-4 text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all" required disabled={!canCapture || isLoading} />
                    <label className={`w-full flex justify-center items-center px-4 py-3 bg-white/80 text-sky-800 rounded-lg tracking-wide border-2 border-dashed border-sky-300 transition-all ${!canCapture || isLoading ? 'cursor-not-allowed' : 'cursor-pointer hover:border-sky-500 hover:bg-sky-50/50'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <span className="text-sm font-semibold">{classroomPhoto ? classroomPhoto.name : 'Upload Classroom Photo'}</span>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} disabled={!canCapture || isLoading} />
                    </label>
                    <button onClick={onGenerateReport} disabled={!canGenerate} className={`w-full py-3 px-4 font-bold text-lg rounded-lg transition-all duration-300 flex items-center justify-center gap-3 ${canGenerate ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/30' : 'bg-slate-300 text-slate-500'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Generate Report
                    </button>
                </div>
            </div>
        </Panel>
    );
};


const ReportPanel: React.FC<{
    activeReport: AttendanceReport | null; isLoading: boolean; error: string | null; totalStudents: number; classroomName?: string;
    reports: AttendanceReport[]; onSelectReport: (report: AttendanceReport) => void; activeReportId?: string | null;
    onStatusChange: (studentId: string, reportId: string) => void;
    onIdentifyClick: (face: DetectedFace) => void; isIdentifying: boolean;
}> = ({ activeReport, isLoading, error, totalStudents, classroomName, reports, onSelectReport, activeReportId, onStatusChange, onIdentifyClick, isIdentifying }) => (
    <Panel className="min-h-[600px] flex flex-col">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-center text-slate-800">Attendance Report</h2>
        <p className="text-center text-slate-500 mb-6 text-sm">{activeReport ? `Report for ${activeReport.classroomName} (${activeReport.period}) on ${new Date(activeReport.date).toLocaleDateString()}` : (classroomName || 'No classroom selected')}</p>
        <div className="flex-grow">
        {isLoading ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center"><Spinner size="lg"/><p className="mt-4 text-lg text-slate-600 font-semibold">AI is analyzing the classroom...</p><p className="text-sm text-slate-500">This may take a moment.</p></div>
        ) : error ? <ErrorMessage message={error} />
        : activeReport ? (
            <div className="space-y-6">
                <AttendanceResultDisplay attendance={activeReport.attendance} totalStudents={totalStudents} classroomName={activeReport.classroomName} date={activeReport.date} period={activeReport.period} onStatusChange={(studentId) => onStatusChange(studentId, activeReport.id)} engagementSummary={activeReport.engagementSummary} />
                <ClassroomResultDisplay imageUrl={activeReport.capturedImageAsDataUrl} faces={activeReport.detectedFaces} onIdentifyClick={onIdentifyClick} isIdentifying={isIdentifying}/>
            </div>
        ) : <ResultsPlaceholder message={!classroomName ? "Select a classroom to view its reports." : "Upload a photo to take a new attendance report, or select one from the history below."} />}
        </div>
        {reports.length > 0 && <ReportHistory reports={reports} onSelectReport={onSelectReport} activeReportId={activeReportId} />}
    </Panel>
);

const ReportHistory: React.FC<{ reports: AttendanceReport[]; onSelectReport: (report: AttendanceReport) => void; activeReportId?: string | null; }> = ({ reports, onSelectReport, activeReportId }) => (
    <div className="mt-8 pt-6 border-t border-sky-200/80"><h3 className="text-lg font-semibold text-slate-700 mb-3">Report History</h3><div className="max-h-40 overflow-y-auto space-y-2 pr-2">{reports.map(report => (<button key={report.id} onClick={() => onSelectReport(report)} className={`w-full text-left p-2 rounded-lg border transition-all ${activeReportId === report.id ? 'bg-sky-100 border-sky-500' : 'bg-sky-50/50 hover:bg-sky-100/70 border-sky-100'}`}><p className="font-semibold text-sm text-slate-800">Period: {report.period}</p><p className="text-xs text-slate-500">{new Date(report.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</p></button>))}</div></div>
);

const ClassroomManager: React.FC<{
    classrooms: Classroom[],
    selectedId: string | null,
    onAdd: (name: string) => void,
    onDelete: (id: string) => void,
    onUpdate: (id: string, newName: string) => void,
    onSelect: (id: string) => void,
    isDisabled: boolean
}> = ({ classrooms, selectedId, onAdd, onDelete, onUpdate, onSelect, isDisabled }) => {
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editedName, setEditedName] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingId]);

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(''); } };

    const handleStartEdit = (classroom: Classroom) => {
        setEditingId(classroom.id);
        setEditedName(classroom.name);
    };
    const handleCancelEdit = () => {
        setEditingId(null);
        setEditedName('');
    };
    const handleSaveEdit = () => {
        if (editingId && editedName.trim()) {
            onUpdate(editingId, editedName.trim());
        }
        handleCancelEdit();
    };

    return (
        <div className="space-y-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input type="text" placeholder="New Classroom Name" value={name} onChange={e => setName(e.target.value)} className="flex-grow bg-sky-50/80 border border-sky-300/80 rounded-lg py-2.5 px-4 text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all disabled:opacity-50" required disabled={isDisabled || !!editingId} />
                <button type="submit" disabled={!name.trim() || isDisabled || !!editingId} className="py-2 px-4 font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed">Create</button>
            </form>
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-2">
                {classrooms.length === 0 ? <p className="text-center text-slate-500 bg-sky-50/50 p-4 rounded-lg border-dashed border-2 border-sky-200/80">No classrooms created yet.</p> : classrooms.map(c => (
                    editingId === c.id ? (
                        <div key={c.id} className="flex items-center gap-2 p-3 rounded-lg border bg-sky-100 border-sky-500 shadow-inner animate-fade-in-fast">
                            <input ref={editInputRef} type="text" value={editedName} onChange={e => setEditedName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }} className="flex-grow bg-white border border-sky-400 rounded-md py-1 px-2 text-slate-800 outline-none focus:ring-1 focus:ring-sky-500 text-sm font-semibold"/>
                            <div className="flex items-center flex-shrink-0">
                                <button onClick={handleSaveEdit} className="p-1.5 rounded-full text-green-600 hover:bg-green-100" aria-label={`Save changes for ${c.name}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                                <button onClick={handleCancelEdit} className="p-1.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-100" aria-label="Cancel edit"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                            </div>
                        </div>
                    ) : (
                        <div key={c.id} onClick={() => onSelect(c.id)} className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${selectedId === c.id ? 'bg-sky-100 border-sky-500 shadow-sm' : 'bg-sky-50/50 border-sky-200/80 hover:bg-sky-100/70'}`}>
                            <div>
                                <p className="font-semibold text-slate-800">{c.name}</p>
                                <p className="text-xs text-slate-500">{c.students.length} Student{c.students.length !== 1 && 's'}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); handleStartEdit(c); }} className="text-slate-400 hover:text-sky-600 p-1.5 rounded-full hover:bg-sky-100 transition-colors" aria-label={`Edit ${c.name}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="text-slate-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-100 transition-colors flex-shrink-0" aria-label={`Delete ${c.name}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
};


const AddStudentForm: React.FC<{ onAddStudent: (name: string, rollNumber: string, password: string, file: File) => void, setError: (msg: string | null) => void, isDisabled: boolean }> = ({ onAddStudent, setError, isDisabled }) => {
  const [name, setName] = useState(''); const [rollNumber, setRollNumber] = useState(''); const [password, setPassword] = useState(''); const [file, setFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const canSubmit = useMemo(() => name.trim() && rollNumber.trim() && password.trim() && file && !isDisabled, [name, rollNumber, password, file, isDisabled]);
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!canSubmit) return; onAddStudent(name.trim(), rollNumber.trim(), password.trim(), file!); setName(''); setRollNumber(''); setPassword(''); setFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; setError(null); };
  return (<form onSubmit={handleSubmit} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><input type="text" placeholder="Student Full Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/80 border border-sky-300/80 rounded-lg py-2 px-3" required disabled={isDisabled}/><input type="text" placeholder="Library ID" value={rollNumber} onChange={e => setRollNumber(e.target.value)} className="w-full bg-white/80 border border-sky-300/80 rounded-lg py-2 px-3" required disabled={isDisabled}/></div><input type="password" placeholder="Set Student Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/80 border border-sky-300/80 rounded-lg py-2 px-3" required disabled={isDisabled}/><label className={`w-full flex justify-center items-center px-4 py-2 bg-white/80 text-slate-700 rounded-lg tracking-wide border-2 border-dashed border-sky-300 transition-all ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:border-sky-500'}`}><span className="text-sm font-semibold">{file ? file.name : 'Select Student Photo'}</span><input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => e.target.files && setFile(e.target.files[0])} disabled={isDisabled} /></label><button type="submit" disabled={!canSubmit} className="w-full py-2 px-4 bg-sky-200 text-sky-800 font-semibold rounded-lg hover:bg-sky-300 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed">Add Student</button></form>);
}

const StudentList: React.FC<{ students: Student[], onRemove: (id: string) => void, onView: (student: Student) => void, onEdit: (student: Student) => void }> = ({ students, onRemove, onView, onEdit }) => {
    if (students.length === 0) return <p className="mt-4 text-center text-sm text-slate-500">This roster is empty.</p>;
    return (<div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-2">{students.map((student) => (<div key={student.id} className="flex items-center gap-3 bg-white/70 p-2 rounded-lg border border-sky-200/80 shadow-sm"> <img src={student.imageUrl} alt={student.name} className="w-10 h-10 rounded-md object-cover" /> <div className="flex-grow"><p className="font-semibold text-sm text-slate-800">{student.name}</p><p className="text-xs text-slate-500">Library ID: {student.rollNumber}</p></div> <button onClick={() => onEdit(student)} className="text-slate-400 hover:text-sky-600 p-1 rounded-full hover:bg-sky-100" aria-label={`Edit ${student.name}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg></button> <button onClick={() => onView(student)} className="text-slate-400 hover:text-sky-600 p-1 rounded-full hover:bg-sky-100" aria-label={`View profile for ${student.name}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg></button> <button onClick={() => onRemove(student.id)} className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100" aria-label={`Remove ${student.name}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button></div>))}</div>);
}

const ResultsPlaceholder: React.FC<{ message: string }> = ({ message }) => (
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4"><svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4 text-sky-300/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><h3 className="text-xl font-semibold text-slate-500">Awaiting Report</h3><p className="mt-2 max-w-sm">{message}</p></div>
);

const ErrorMessage: React.FC<{ message: string }> = ({ message }) => ( <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg" role="alert"><strong className="font-bold">Error:</strong><span className="block sm:inline ml-2">{message}</span></div> );
const Spinner: React.FC<{size?: 'sm' | 'md' | 'lg'}> = ({ size = 'md' }) => { const s = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' }; return <div className={`${s[size]} border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin`}></div>; }

const AttendanceResultDisplay: React.FC<{ attendance: AttendanceRecord[], totalStudents: number, classroomName: string, date: string, period: string, onStatusChange: (studentId: string) => void, engagementSummary: string }> = ({ attendance, totalStudents, classroomName, date, period, onStatusChange, engagementSummary }) => {
    const presentCount = useMemo(() => attendance.filter(r => r.status === AttendanceStatus.Present).length, [attendance]);
    const absentCount = totalStudents - presentCount;
    const handleDownloadCSV = useCallback(() => {
        if (!attendance || attendance.length === 0) return;

        const headers = ["Roll Number", "Student Name", "Status"];
        const csvContent = [
            headers.join(','),
            ...attendance
                .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))
                .map(record => [record.rollNumber, `"${record.name.replace(/"/g, '""')}"`, record.status].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const reportDate = new Date(date).toISOString().split('T')[0];
        const safeClassroomName = classroomName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const safePeriod = period.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.setAttribute('download', `attendance_${safeClassroomName}_${safePeriod}_${reportDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [attendance, classroomName, date, period]);
    
    return (<div className="animate-fade-in"><div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold text-slate-700">Summary</h3><button onClick={handleDownloadCSV} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-sky-100/80 text-sky-800 rounded-md hover:bg-sky-200/80 border border-sky-200">Download CSV</button></div><div className="grid grid-cols-3 gap-3 mb-5 text-center"><div className="bg-slate-100 p-3 rounded-lg"><div className="text-2xl font-bold">{totalStudents}</div><div className="text-xs font-semibold text-slate-600 uppercase">Total</div></div><div className="bg-green-100 p-3 rounded-lg"><div className="text-2xl font-bold text-green-700">{presentCount}</div><div className="text-xs font-semibold text-green-800 uppercase">Present</div></div><div className="bg-red-100 p-3 rounded-lg"><div className="text-2xl font-bold text-red-700">{absentCount}</div><div className="text-xs font-semibold text-red-800 uppercase">Absent</div></div></div><div className="text-sm border border-sky-200/80 rounded-lg max-h-48 overflow-y-auto"><table className="w-full text-left"><thead className="bg-sky-50/70 sticky top-0"><tr><th className="p-3 font-semibold">Student Name</th><th className="p-3 font-semibold text-right">Status</th></tr></thead><tbody className="divide-y divide-sky-200/80">{[...attendance].sort((a, b) => a.name.localeCompare(b.name)).map(record => (<tr key={record.studentId}><td className="p-3 font-medium text-slate-800">{record.name}</td><td className="p-3 text-right"><button onClick={() => onStatusChange(record.studentId)} className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80 ${record.status === AttendanceStatus.Present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{record.status.toUpperCase()}</button></td></tr>))}</tbody></table></div><div className="mt-4"><h4 className="font-semibold text-slate-700">AI Engagement Summary</h4><p className="text-sm text-slate-600 bg-sky-50/70 p-3 rounded-lg border border-sky-200/80 mt-2">{engagementSummary}</p></div></div>);
};

const ClassroomResultDisplay: React.FC<{ imageUrl: string; faces: DetectedFace[], onIdentifyClick: (face: DetectedFace) => void; isIdentifying: boolean; }> = ({ imageUrl, faces, onIdentifyClick, isIdentifying }) => (
    <div className="animate-fade-in pt-4"><h3 className="text-lg font-semibold mb-3 text-center text-slate-700">Detection Results</h3><div className="relative rounded-lg overflow-hidden shadow-md border"><img src={imageUrl} alt="Classroom with detections" className="w-full h-auto" />{faces.map((face) => { const isKnown = face.name !== 'Unknown'; const color = isKnown ? 'border-sky-500' : 'border-yellow-400'; const bgColor = isKnown ? 'bg-sky-600/90' : 'bg-yellow-400/90'; return (<div key={face.id} onClick={() => !isKnown && onIdentifyClick(face)} className={`absolute border-2 ${color} rounded-sm ${!isKnown && !isIdentifying ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`} style={{ top: `${face.box.top * 100}%`, left: `${face.box.left * 100}%`, width: `${(face.box.right - face.box.left) * 100}%`, height: `${(face.box.bottom - face.box.top) * 100}%`}}><span className={`absolute -top-6 left-0 text-xs font-bold px-1.5 py-0.5 rounded ${bgColor} text-white whitespace-nowrap`}>{face.name}</span></div>); })}</div></div>
);

// --- MODAL & DASHBOARD COMPONENTS ---
const StudentProfileModal: React.FC<{ student: Student; reports: AttendanceReport[]; onClose: () => void; }> = ({ student, reports, onClose }) => {
    const studentRecords = useMemo(() => reports.map(r => ({ ...r, attendance: r.attendance.find(a => a.studentId === student.id) })).filter(r => r.attendance), [reports, student.id]);
    return (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}><div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col border border-white/50" onClick={e => e.stopPropagation()}><div className="p-6 border-b border-sky-200/80 flex items-center gap-4"><img src={student.imageUrl} alt={student.name} className="w-20 h-20 rounded-full object-cover border-4 border-white" /><div><h3 className="text-2xl font-bold text-slate-800">{student.name}</h3><p className="text-slate-500">Library ID: {student.rollNumber}</p></div><button onClick={onClose} type="button" aria-label="Close" className="ml-auto text-slate-400 hover:text-slate-800 p-2 rounded-full transition-colors hover:bg-sky-100/50"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div><div className="p-6 flex-grow overflow-y-auto"><h4 className="font-semibold mb-3">Attendance History</h4>{studentRecords.length > 0 ? <ul className="space-y-2">{studentRecords.map(r => (<li key={r.id} className="flex justify-between items-center p-3 bg-sky-50/50 rounded-md border border-sky-100/80"><div className="text-sm"><p className="font-semibold text-slate-700">{r.period}</p><p className="text-xs text-slate-500">{new Date(r.date).toLocaleString()}</p></div><span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${r.attendance?.status === AttendanceStatus.Present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{r.attendance?.status.toUpperCase()}</span></li>))}</ul> : <p className="text-center text-slate-500 text-sm mt-4">No attendance records found.</p>}</div></div></div>);
};

const EditStudentModal: React.FC<{
    student: Student;
    onClose: () => void;
    onSave: (studentId: string, data: { name: string; rollNumber: string; password?: string }) => void;
}> = ({ student, onClose, onSave }) => {
    const [name, setName] = useState(student.name);
    const [rollNumber, setRollNumber] = useState(student.rollNumber);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dataToSave: { name: string, rollNumber: string, password?: string } = {
            name: name.trim(),
            rollNumber: rollNumber.trim(),
        };
        if (password) {
            dataToSave.password = password;
        }
        onSave(student.id, dataToSave);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full border border-white/50" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-sky-200/80 flex justify-between items-center">
                    <h3 className="text-2xl font-bold text-slate-800">Edit Student</h3>
                    <button onClick={onClose} type="button" aria-label="Close" className="text-slate-400 hover:text-slate-800 p-2 rounded-full transition-colors hover:bg-sky-100/50">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label htmlFor="edit-name" className="block text-sm font-semibold text-slate-600 mb-1">Full Name</label>
                        <input id="edit-name" type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/80 border border-sky-300/80 rounded-lg py-2 px-3" required />
                    </div>
                     <div>
                        <label htmlFor="edit-roll" className="block text-sm font-semibold text-slate-600 mb-1">Library ID</label>
                        <input id="edit-roll" type="text" value={rollNumber} onChange={e => setRollNumber(e.target.value)} className="w-full bg-white/80 border border-sky-300/80 rounded-lg py-2 px-3" required />
                    </div>
                    <div>
                        <label htmlFor="edit-password" className="block text-sm font-semibold text-slate-600 mb-1">New Password (optional)</label>
                        <div className="relative">
                        <input id="edit-password" type={showPassword ? 'text' : 'password'} placeholder="Leave blank to keep current" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/80 border border-sky-300/80 rounded-lg py-2 px-3 pr-10" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-800" aria-label="Toggle password visibility">
                                {showPassword ? 
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg> :
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414L18.434 16.5A10.02 10.02 0 0110 17c-4.478 0-8.268-2.943-9.542-7 .94-2.45 3.037-4.425 5.766-5.497L3.707 2.293zM10 12a2 2 0 100-4 2 2 0 000 4z" /><path d="M10 3a9.958 9.958 0 00-4.512 1.074l1.65 1.65A5.98 5.98 0 0110 5c2.485 0 4.686 1.343 6.042 3.535l-1.65-1.65A9.958 9.958 0 0010 3z" /></svg>
                                }
                            </button>
                        </div>
                    </div>
                    <div className="pt-2 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="py-2 px-5 font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
                        <button type="submit" className="py-2 px-5 font-semibold bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors shadow-sm">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const SuggestionModal: React.FC<{ result: { face: DetectedFace; suggestion: string | null; image: string; }; onConfirm: (name: string, faceId: string) => void; onClose: () => void; }> = ({ result, onConfirm, onClose }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}><div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center border border-white/50" onClick={e => e.stopPropagation()}><h3 className="text-xl font-bold mb-4">Identify Student</h3><img src={result.image} alt="Unknown person" className="w-32 h-32 rounded-full object-cover mx-auto mb-4 border-4 border-yellow-400" /><p className="text-slate-600 mb-4">AI Suggestion:</p>{result.suggestion && result.suggestion !== 'Unable to identify' ? (<><p className="text-2xl font-semibold text-sky-600 mb-6">{result.suggestion}</p><div className="flex gap-4"><button onClick={onClose} type="button" className="w-full py-2 px-4 rounded-lg border border-slate-300 hover:bg-slate-100/50">Cancel</button><button onClick={() => onConfirm(result.suggestion!, result.face.id)} type="button" className="w-full py-2 px-4 rounded-lg bg-sky-500 text-white font-semibold hover:bg-sky-600">Confirm</button></div></>) : <p className="font-semibold text-red-600 bg-red-50 p-3 rounded-md">Unable to identify.</p>}</div></div>
);

export default App;