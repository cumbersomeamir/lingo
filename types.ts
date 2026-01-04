
export enum Language {
  SPANISH = 'Spanish',
  FRENCH = 'French',
  GERMAN = 'German',
  JAPANESE = 'Japanese',
  CHINESE = 'Chinese',
  ITALIAN = 'Italian',
  PORTUGUESE = 'Portuguese',
  ENGLISH = 'English',
  KOREAN = 'Korean',
  HINDI = 'Hindi'
}

export interface TranscriptionEntry {
  id: string;
  speaker: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface SessionState {
  isActive: boolean;
  targetLanguage: Language;
  nativeLanguage: Language;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
}
