
import React, { useState, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Language, TranscriptionEntry } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audioHelpers';
import { Visualizer } from './components/Visualizer';
import { TranscriptionList } from './components/TranscriptionList';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<Language>(Language.SPANISH);
  const [nativeLanguage, setNativeLanguage] = useState<Language>(Language.ENGLISH);
  const [proficiency, setProficiency] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<any>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const stopConversation = useCallback(() => {
    try {
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
      }
      if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
      }
      sourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
      });
      sourcesRef.current.clear();
      nextStartTimeRef.current = 0;
    } catch (e) {
      console.warn('Cleanup error:', e);
    } finally {
      setIsActive(false);
      setIsAiSpeaking(false);
    }
  }, []);

  const startConversation = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize Audio Contexts
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        callbacks: {
          onopen: () => {
            setIsActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              if (sessionRef.current) {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then((session) => {
                  if (session) session.sendRealtimeInput({ media: pcmBlob });
                }).catch(() => {});
              }
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setIsAiSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
              };

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAiSpeaking(false);
            }

            if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userInput = currentInputTranscription.current.trim();
              const aiOutput = currentOutputTranscription.current.trim();

              if (userInput) {
                setTranscriptions(prev => [...prev, {
                  id: Math.random().toString(36).substr(2, 9),
                  speaker: 'user',
                  text: userInput,
                  timestamp: Date.now()
                }]);
              }
              if (aiOutput) {
                setTranscriptions(prev => [...prev, {
                  id: Math.random().toString(36).substr(2, 9),
                  speaker: 'ai',
                  text: aiOutput,
                  timestamp: Date.now()
                }]);
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }
          },
          onerror: (e) => {
            console.error('Gemini Live Connection Error:', e);
            setError('Connection error. Please check your internet and API key status.');
            stopConversation();
          },
          onclose: (e) => {
            console.log('Session closed:', e);
            setIsActive(false);
            stopConversation();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are a professional and patient language tutor named Lingo.
          The user's native language is ${nativeLanguage}.
          The user is trying to learn ${targetLanguage} and is at a ${proficiency} level.
          
          PEDAGOGICAL STRATEGY:
          1. Speak PRIMARILY in ${nativeLanguage} for clarity.
          2. Introduce ${targetLanguage} step-by-step. Use short phrases and specific vocabulary.
          3. Immediately explain target language phrases in ${nativeLanguage}.
          4. Encourage repetition.
          5. Correct pronunciation gently.
          
          Maintain a concise, back-and-forth educational dialogue.`
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error('Initialization error:', err);
      setError(err?.message || 'Failed to start learning session.');
      stopConversation();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-4xl flex justify-between items-center mb-12">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">L</div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">LingoLive</h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Status</span>
            <div className="flex items-center space-x-1.5">
              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-sm font-medium text-slate-600">{isActive ? 'Live' : 'Ready'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <section className="md:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Tutor Settings</h2>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">My Native Language</label>
                <select
                  disabled={isActive}
                  value={nativeLanguage}
                  onChange={(e) => setNativeLanguage(e.target.value as Language)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {Object.values(Language).map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">I want to learn</label>
                <select
                  disabled={isActive}
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value as Language)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 font-semibold text-indigo-700"
                >
                  {Object.values(Language).map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">Level</label>
                <div className="flex p-1 bg-slate-50 rounded-lg border border-slate-200">
                  {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                    <button
                      key={level}
                      disabled={isActive}
                      onClick={() => setProficiency(level)}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                        proficiency === level 
                          ? 'bg-white text-indigo-600 shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      } disabled:cursor-not-allowed`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 flex flex-col items-center text-center">
              <Visualizer isActive={isActive} isSpeaking={isAiSpeaking} />
              <p className="mt-4 text-xs font-medium text-indigo-700">
                {isActive 
                  ? (isAiSpeaking ? 'Lingo is teaching...' : 'Listening...') 
                  : 'Start session to begin learning'}
              </p>
            </div>
            
            <button
              onClick={isActive ? stopConversation : startConversation}
              className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all active:scale-95 ${
                isActive 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-100' 
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
              }`}
            >
              {isActive ? 'End Session' : 'Start Learning'}
            </button>
            
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium text-center leading-relaxed">
                {error}
              </div>
            )}
          </section>

          <section className="md:col-span-2 flex flex-col">
            <TranscriptionList entries={transcriptions} />
            <div className="mt-4 flex justify-between items-center text-slate-400 px-2">
              <span className="text-xs">Real-time learning logs powered by Gemini 2.5</span>
              <button 
                onClick={() => setTranscriptions([])}
                className="text-xs hover:text-indigo-600 font-medium transition-colors"
              >
                Clear History
              </button>
            </div>
          </section>
        </div>
      </main>

      <footer className="mt-auto py-8 text-slate-400 text-[10px] uppercase font-bold tracking-[0.2em]">
        Step-by-Step Immersive Tutor • LingoLive v1.2
      </footer>
    </div>
  );
};

export default App;
