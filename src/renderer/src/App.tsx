import React, { useState } from 'react';
import { Mic, Image as ImageIcon, Video, Settings, Film, Search, Download, Layers, Play } from 'lucide-react';
import { create } from 'zustand';
import clsx from 'clsx';

// --- Types ---
interface AppState {
    currentMode: 'voice' | 'prompts' | 'images' | 'video' | 'settings';
    setMode: (mode: 'voice' | 'prompts' | 'images' | 'video' | 'settings') => void;
    apiKeys: {
        gemini1: string;
        gemini2: string;
        gemini3: string;
        pexels: string;
        pixabay: string;
        workerAuth: string;
    };
    setApiKey: (key: string, value: string) => void;
    loadApiKeys: () => Promise<void>;
}

const defaultKeys = {
    gemini1: 'AIzaSyDXFJsp90E3WkUE61tJb_pjGhRXT4HUHkI',
    gemini2: 'AIzaSyC0r2Avr7FE8A-iUTReLytepeMCC2Bjn1I',
    gemini3: 'AIzaSyCHbsTLj89Mi7H7HBbvpQwGnMpcTDSmg-I',
    pexels: 'QO8xtBw362DEvUbg4Q9mqL2BMWiu3d0QZIqaimzIjXcrJkehrt3WnHFS',
    pixabay: '53609210-93aa64f94fa4a665c73277ee0',
    workerAuth: '12345678',
};

const useStore = create<AppState>((set) => ({
    currentMode: 'voice',
    setMode: (mode) => set({ currentMode: mode }),
    apiKeys: defaultKeys,
    setApiKey: (key, value) => {
        set((state) => {
            const newKeys = { ...state.apiKeys, [key]: value };
            // Persist to electron-store
            (window as any).api.setSettings('apiKeys', newKeys);
            return { apiKeys: newKeys };
        });
    },
    loadApiKeys: async () => {
        const storedKeys = await (window as any).api.getSettings('apiKeys');
        if (storedKeys) {
            set((state) => ({ apiKeys: { ...state.apiKeys, ...storedKeys } }));
        }
    }
}));

// --- Components ---

function Sidebar() {
    const { currentMode, setMode } = useStore();

    const items = [
        { id: 'voice', icon: Mic, label: 'Voice Over' },
        { id: 'prompts', icon: Film, label: 'Video Prompts' },
        { id: 'images', icon: ImageIcon, label: 'Image Gen' },
        { id: 'video', icon: Video, label: 'Auto Video' },
        { id: 'settings', icon: Settings, label: 'Settings' },
    ];

    return (
        <div className="w-64 bg-gray-800 h-screen flex flex-col border-r border-gray-700">
            <div className="p-4 text-xl font-bold bg-gray-900 flex items-center gap-2">
                <Video className="w-6 h-6 text-blue-500" />
                AI Editor
            </div>
            <nav className="flex-1 p-2 space-y-1">
                {items.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setMode(item.id as any)}
                        className={clsx(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                            currentMode === item.id
                                ? "bg-blue-600 text-white"
                                : "text-gray-400 hover:bg-gray-700 hover:text-white"
                        )}
                    >
                        <item.icon className="w-5 h-5" />
                        {item.label}
                    </button>
                ))}
            </nav>
        </div>
    );
}

function VoiceOverMode() {
    const { apiKeys } = useStore();
    const [script, setScript] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!script) return;
        setLoading(true);
        try {
            const res = await (window as any).api.generateVoiceOver({
                text: script,
                apiKey: apiKeys.gemini1,
                model: 'gemini-2.5-flash-preview-tts',
                voiceName: 'Charon'
            });
            if (res.success) {
                setResult(`Voiceover saved to: ${res.filePath}`);
            } else {
                setResult(`Error: ${res.error}`);
            }
        } catch (err: any) {
            setResult(`Error: ${err.message}`);
        }
        setLoading(false);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Generate Voice Over</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Script</label>
                    <textarea
                        className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg p-4 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Enter your script here..."
                        value={script}
                        onChange={(e) => setScript(e.target.value)}
                    />
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={loading || !script}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {loading ? 'Generating...' : 'Generate Voiceover'}
                </button>
                {result && (
                    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 mt-4">
                        {result}
                    </div>
                )}
            </div>
        </div>
    );
}

function PromptMode() {
    const { apiKeys } = useStore();
    const [script, setScript] = useState('');
    const [duration, setDuration] = useState('60');
    const [loading, setLoading] = useState(false);
    const [prompts, setPrompts] = useState('');

    const handleGenerate = async () => {
        if (!script) return;
        setLoading(true);
        try {
            const systemPrompt = `Act as a World-Class Visual Director and AI Video Prompt Engineer.
            Objective: I will provide you with a script or a sentence. You must generate specific, creative, and high-retention image generation prompts that I can feed into Meta AI to create 5-second video clips.
            Crucial Style Guidelines (Do NOT Ignore):
            NO "Commercial/Stock" Vibes. Cinematic & Moody. Visual Metaphors.
            Structure of your output: Visual Concept: [Concept] Prompt: [Prompt]`;

            const res = await (window as any).api.generateText({
                prompt: `Script: ${script}\nDuration: ${duration} seconds. Generate prompts.`,
                systemPrompt: systemPrompt,
                apiKey: apiKeys.workerAuth,
                provider: 'cloudflare',
                workerUrl: 'https://aiapi.dreamtravelbusiness863.workers.dev/'
            });

            if (res.success) {
                setPrompts(res.text);
            } else {
                setPrompts(`Error: ${res.error}`);
            }
        } catch (err: any) {
            setPrompts(`Error: ${err.message}`);
        }
        setLoading(false);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Video Prompts Generator</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Voice Duration (seconds)</label>
                    <input
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                    />
                </div>
            </div>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-1">Script</label>
                <textarea
                    className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg p-4 text-white"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                />
            </div>
            <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium mb-6"
            >
                {loading ? 'Generating...' : 'Generate Prompts'}
            </button>
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 min-h-[200px] whitespace-pre-wrap">
                {prompts || 'Prompts will appear here...'}
            </div>
        </div>
    );
}

function ImageMode() {
    const { apiKeys } = useStore();
    const [mode, setLocalMode] = useState<'single' | 'sequence'>('single');
    const [prompt, setPrompt] = useState(''); // for single
    const [script, setScript] = useState(''); // for sequence
    const [duration, setDuration] = useState('60');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    const handleGenerate = async () => {
        setLoading(true);
        setStatus('Generating...');
        try {
            if (mode === 'single') {
                if (!prompt) return;
                const res = await (window as any).api.generateImage({
                    prompt: prompt,
                    apiKey: apiKeys.workerAuth,
                    workerUrl: 'https://imgegen.dreamtravelbusiness863.workers.dev/'
                });
                if (res.success) setStatus(`Image saved to: ${res.filePath}`);
                else setStatus(`Error: ${res.error}`);
            } else {
                if (!script) return;
                const res = await (window as any).api.generateImageSequence({
                    script: script,
                    duration: duration,
                    apiKey: apiKeys.workerAuth, // Cloudflare
                    geminiApiKey: apiKeys.gemini1, // Gemini for prompts
                    workerUrl: 'https://imgegen.dreamtravelbusiness863.workers.dev/'
                });
                if (res.success) setStatus(`Sequence saved to: ${res.folderPath}\nGenerated ${res.files.length} images.`);
                else setStatus(`Error: ${res.error}`);
            }
        } catch (err: any) {
            setStatus(`Error: ${err.message}`);
        }
        setLoading(false);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
             <h2 className="text-2xl font-bold mb-6">Image Generator</h2>
             <div className="flex gap-4 mb-6">
                <button onClick={() => setLocalMode('single')} className={clsx("px-4 py-2 rounded-lg", mode === 'single' ? "bg-blue-600" : "bg-gray-700")}>Single Image</button>
                <button onClick={() => setLocalMode('sequence')} className={clsx("px-4 py-2 rounded-lg", mode === 'sequence' ? "bg-blue-600" : "bg-gray-700")}>Sequence (Auto)</button>
             </div>

             {mode === 'single' ? (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-400 mb-1">Prompt</label>
                    <textarea
                        className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg p-4 text-white"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>
             ) : (
                 <div className="space-y-4 mb-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Duration (seconds)</label>
                        <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white" />
                     </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Script</label>
                        <textarea
                            className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg p-4 text-white"
                            value={script}
                            onChange={(e) => setScript(e.target.value)}
                        />
                    </div>
                </div>
             )}

             <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium mb-6"
            >
                {loading ? 'Generating...' : 'Generate'}
            </button>
            {status && <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 whitespace-pre-wrap">{status}</div>}
        </div>
    );
}

function VideoMode() {
    const { apiKeys } = useStore();
    const [subMode, setSubMode] = useState<'search' | 'auto'>('search');

    // Search State
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [source, setSource] = useState<'pexels' | 'pixabay'>('pexels');

    // Auto State
    const [script, setScript] = useState('');
    const [autoStatus, setAutoStatus] = useState('');

    const handleSearch = async () => {
        if (!query) return;
        setLoading(true);
        try {
            const res = await (window as any).api.searchStock({ query, source, apiKey: source === 'pexels' ? apiKeys.pexels : apiKeys.pixabay });
            if (res.success) setResults(res.results);
            else alert(`Error: ${res.error}`);
        } catch (err: any) { alert(`Error: ${err.message}`); }
        setLoading(false);
    };

    const handleAutoCreate = async () => {
        if (!script) return;
        setLoading(true);
        setAutoStatus('Initializing pipeline... Step 1: Voiceover & Keywords');
        try {
             const res = await (window as any).api.assembleVideo({
                 script,
                 apiKeys
             });

             if (res.success) {
                 setAutoStatus(`Success! Video saved to: ${res.filePath}`);
             } else {
                 setAutoStatus(`Error: ${res.error}`);
             }
        } catch (err: any) {
             setAutoStatus(`Error: ${err.message}`);
        }
        setLoading(false);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
            <h2 className="text-2xl font-bold mb-6">Auto Video Creator</h2>
             <div className="flex gap-4 mb-6">
                <button onClick={() => setSubMode('search')} className={clsx("px-4 py-2 rounded-lg", subMode === 'search' ? "bg-blue-600" : "bg-gray-700")}>Stock Search</button>
                <button onClick={() => setSubMode('auto')} className={clsx("px-4 py-2 rounded-lg", subMode === 'auto' ? "bg-blue-600" : "bg-gray-700")}>Auto Generate</button>
             </div>

             {subMode === 'search' ? (
                <>
                    <div className="flex gap-4 mb-4">
                        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for stock media..." className="flex-1 bg-gray-700 border border-gray-600 rounded-lg p-2 text-white" />
                        <select value={source} onChange={(e) => setSource(e.target.value as any)} className="bg-gray-700 border border-gray-600 rounded-lg p-2 text-white">
                            <option value="pexels">Pexels</option>
                            <option value="pixabay">Pixabay</option>
                        </select>
                        <button onClick={handleSearch} disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">{loading ? '...' : <Search className="w-5 h-5" />}</button>
                    </div>
                    <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-4">
                        {results.map((item: any) => (
                            <div key={item.id} className="relative group rounded-lg overflow-hidden bg-gray-800">
                                <img src={source === 'pexels' ? item.src.medium : item.webformatURL} alt="Stock" className="w-full h-40 object-cover"/>
                            </div>
                        ))}
                    </div>
                </>
             ) : (
                 <div className="space-y-4">
                    <div className="bg-blue-900/30 p-4 rounded-lg border border-blue-800 text-sm">
                        Full Automation:
                        1. Generates Voiceover (Gemini)
                        2. Extracts Keywords (Gemini)
                        3. Downloads Stock Videos (Pexels)
                        4. Assembles Video (FFmpeg)
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Video Script</label>
                        <textarea className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg p-4 text-white" value={script} onChange={(e) => setScript(e.target.value)} placeholder="Enter your full video script here..." />
                    </div>
                    <button onClick={handleAutoCreate} disabled={loading} className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium flex items-center gap-2">
                        {loading ? 'Processing...' : <><Play className="w-5 h-5" /> Create Video</>}
                    </button>
                    {autoStatus && <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 mt-4 whitespace-pre-wrap">{autoStatus}</div>}
                 </div>
             )}
        </div>
    );
}

function SettingsMode() {
    const { apiKeys, setApiKey } = useStore();
    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Settings & API Keys</h2>
            <div className="space-y-4">
                {Object.entries(apiKeys).map(([key, value]) => (
                    <div key={key}>
                        <label className="block text-sm font-medium text-gray-400 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()} API Key</label>
                        <input type="password" value={value} onChange={(e) => setApiKey(key, e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function App() {
    const { currentMode, loadApiKeys } = useStore();

    React.useEffect(() => {
        loadApiKeys();
    }, []);

    return (
        <div className="flex h-screen bg-gray-900 text-white font-sans">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                {currentMode === 'voice' && <VoiceOverMode />}
                {currentMode === 'prompts' && <PromptMode />}
                {currentMode === 'images' && <ImageMode />}
                {currentMode === 'video' && <VideoMode />}
                {currentMode === 'settings' && <SettingsMode />}
            </main>
        </div>
    );
}

export default App;
