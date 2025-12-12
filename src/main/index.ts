import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { GoogleGenAI } from '@google/genai'
import Store from 'electron-store'
import axios from 'axios'
import ffmpeg from 'fluent-ffmpeg'

const store = new Store()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // Disable for local file preview (dev only usually, but helpful here)
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- Helpers ---
const downloadFile = async (url: string, dest: string) => {
    const writer = fs.createWriteStream(dest);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

// --- IPC Handlers ---

// 1. Voiceover
ipcMain.handle('generate-voiceover', async (_event, { text, apiKey, voiceName, model }) => {
  try {
    const ai = new GoogleGenAI({ apiKey })
    const ttsModel = model || 'gemini-2.5-flash-preview-tts';

    const config = {
      temperature: 1,
      responseModalities: ['audio'] as any,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName || 'Charon',
          }
        }
      },
    };

    const contents = [{ role: 'user', parts: [{ text }] }];
    const response = await ai.models.generateContentStream({ model: ttsModel, config, contents });
    const chunks: Buffer[] = [];
    for await (const chunk of response) {
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        chunks.push(Buffer.from(chunk.candidates[0].content.parts[0].inlineData.data || '', 'base64'));
      }
    }
    if (chunks.length === 0) throw new Error('No audio data received');

    const audioBuffer = Buffer.concat(chunks);
    const fileName = `voiceover-${Date.now()}.wav`;
    const filePath = path.join(app.getPath('downloads'), fileName);
    fs.writeFileSync(filePath, audioBuffer);
    return { success: true, filePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2. Text/Prompts
ipcMain.handle('generate-text', async (_event, { prompt, systemPrompt, apiKey, provider, workerUrl }) => {
    if (provider === 'cloudflare') {
         try {
            const response = await axios.post(workerUrl, { prompt, systemPrompt, history: [] }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            return { success: true, text: response.data.response };
         } catch (error: any) {
             return { success: false, error: error.message };
         }
    } else {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: (systemPrompt ? systemPrompt + "\n\n" : "") + prompt }] }]
            });
            return { success: true, text: result.response.text() };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
});

// 3. Single Image
ipcMain.handle('generate-image', async (_event, { prompt, apiKey, workerUrl }) => {
    try {
         const response = await axios.post(workerUrl, { prompt }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            responseType: 'arraybuffer'
        });
        const fileName = `generated-image-${Date.now()}.jpg`;
        const filePath = path.join(app.getPath('downloads'), fileName);
        fs.writeFileSync(filePath, Buffer.from(response.data));
        return { success: true, filePath };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// 4. Sequential Images (Mode 3)
ipcMain.handle('generate-image-sequence', async (_event, { script, duration, apiKey, geminiApiKey, workerUrl }) => {
    try {
        const numImages = Math.ceil(parseInt(duration) / 3);
        const folderName = `sequence-${Date.now()}`;
        const folderPath = path.join(app.getPath('downloads'), folderName);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);

        // 1. Generate Prompts using Gemini (free & fast) or Cloudflare
        // Using Gemini for prompt logic as it's better at instruction following
        // Use provided geminiApiKey or fallback to store, but definitely do NOT use 'apiKey' which is Cloudflare's
        const gKey = geminiApiKey || store.get('gemini1');
        if (!gKey) throw new Error("Gemini API Key is required for prompt generation in sequence mode.");

        const ai = new GoogleGenAI({ apiKey: gKey as string });
        const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const promptPrompt = `Script: "${script}"
        Duration: ${duration} seconds.
        I need ${numImages} distinct, sequential image prompts to visualize this script.
        Each prompt should describe a scene that fits the script's progression.
        Format your response ONLY as a JSON array of strings. Example: ["Prompt 1", "Prompt 2"]`;

        const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: promptPrompt }] }] });
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        let prompts: string[] = [];
        try {
            prompts = JSON.parse(text);
        } catch (e) {
            // Fallback parsing if JSON fails
             prompts = text.split('\n').filter(l => l.length > 10).slice(0, numImages);
        }

        // 2. Generate Images
        const generatedFiles: string[] = [];
        for (let i = 0; i < prompts.length; i++) {
             try {
                const response = await axios.post(workerUrl, { prompt: prompts[i] }, {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    responseType: 'arraybuffer'
                });
                const fileName = `image_${i + 1}.jpg`; // Sequential naming 1, 2, 3...
                const filePath = path.join(folderPath, fileName);
                fs.writeFileSync(filePath, Buffer.from(response.data));
                generatedFiles.push(filePath);
             } catch (err) {
                 console.error(`Failed to generate image ${i+1}:`, err);
             }
        }

        return { success: true, folderPath, files: generatedFiles };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
});


// 5. Stock Search
ipcMain.handle('search-stock', async (_event, { query, source, apiKey, perPage = 5 }) => {
    try {
        if (source === 'pexels') {
            const response = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`, {
                headers: { Authorization: apiKey }
            });
            return { success: true, results: response.data.photos };
        } else if (source === 'pixabay') {
            const response = await axios.get(`https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${perPage}`);
            return { success: true, results: response.data.hits };
        }
        return { success: false, error: 'Invalid source' };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// 6. Auto Video Assembly (Mode 4)
ipcMain.handle('assemble-video', async (_event, { script, apiKeys }) => {
    try {
        const tempDir = path.join(os.tmpdir(), `video-project-${Date.now()}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        // Step 1: Voiceover
        const ai = new GoogleGenAI({ apiKey: apiKeys.gemini1 });
        const ttsRes = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-preview-tts',
            config: { responseModalities: ['audio'] as any, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } } },
            contents: [{ role: 'user', parts: [{ text: script }] }]
        });
        const chunks: Buffer[] = [];
        for await (const chunk of ttsRes) {
             if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                chunks.push(Buffer.from(chunk.candidates[0].content.parts[0].inlineData.data || '', 'base64'));
             }
        }
        const audioPath = path.join(tempDir, 'voiceover.wav');
        fs.writeFileSync(audioPath, Buffer.concat(chunks));

        // Get Audio Duration (Approximate or use ffmpeg to probe)
        // For simplicity, we'll estimate words per minute or use ffmpeg probe if available.
        // Let's use ffmpeg probe.
        let duration = 10; // default
        await new Promise((resolve) => {
            ffmpeg.ffprobe(audioPath, (err, metadata) => {
                if (!err && metadata.format.duration) duration = metadata.format.duration;
                resolve(null);
            });
        });

        // Step 2: Keywords & Stock
        const textModel = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const kwRes = await textModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: `Extract 3 visual keywords for stock video search from this script. Comma separated. Script: ${script}` }] }]
        });
        const keywords = kwRes.response.text().split(',').map(s => s.trim())[0] || 'nature';

        // Search Pexels for Videos
        const pexelsRes = await axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(keywords)}&per_page=3&orientation=landscape`, {
            headers: { Authorization: apiKeys.pexels }
        });
        const videos = pexelsRes.data.videos || [];

        const mediaPaths: string[] = [];
        if (videos.length > 0) {
            for (let i = 0; i < Math.min(videos.length, 3); i++) {
                const videoUrl = videos[i].video_files.find(f => f.quality === 'hd' || f.width >= 1280)?.link || videos[i].video_files[0].link;
                const dest = path.join(tempDir, `clip_${i}.mp4`);
                await downloadFile(videoUrl, dest);
                mediaPaths.push(dest);
            }
        }

        if (mediaPaths.length === 0) throw new Error('No stock media found.');

        // Step 3: FFmpeg Assembly
        const outputPath = path.join(app.getPath('downloads'), `final_video_${Date.now()}.mp4`);

        return new Promise((resolve) => {
            let command = ffmpeg();

            // Add inputs
            mediaPaths.forEach(p => command.input(p));
            command.input(audioPath);

            // Complex filter to concat videos and add audio
            // Simplified: Just concat videos (scaled to 1280x720) and mix audio.
            // If duration of videos < audio, we loop or just cut.
            // Here we just concat them.

            const filterInputs = mediaPaths.map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v${i}];`).join('');
            const filterConcat = mediaPaths.map((_, i) => `[v${i}]`).join('') + `concat=n=${mediaPaths.length}:v=1:a=0[outv]`;

            command
                .complexFilter(`${filterInputs}${filterConcat}`)
                .outputOptions([
                    '-map [outv]',
                    `-map ${mediaPaths.length}:a`, // Audio is the last input
                    '-c:v libx264',
                    '-c:a aac',
                    '-shortest' // Cut to shortest stream (audio or video)
                ])
                .save(outputPath)
                .on('end', () => resolve({ success: true, filePath: outputPath }))
                .on('error', (err) => resolve({ success: false, error: err.message }));
        });

    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// Settings
ipcMain.handle('get-settings', (event, key) => store.get(key));
ipcMain.handle('set-settings', (event, key, value) => store.set(key, value));

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
