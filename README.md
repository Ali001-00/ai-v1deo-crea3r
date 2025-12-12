# AI Video Editor

A professional AI-powered video editor Electron desktop application.

## Features

1.  **Voice Over Generator**: Generate AI voiceovers using Google Gemini TTS.
2.  **Video Prompts Generator**: Create high-retention visual prompts for video generation models.
3.  **Image Generator**: Generate single images or sequential image sets based on scripts.
4.  **Auto Video Creator**: Search stock media (Pexels/Pixabay) and automatically assemble videos with voiceovers (requires FFmpeg).

## Prerequisites

-   **Node.js**: Install Node.js (v18 or higher).
-   **FFmpeg**: Required for the Auto Video Creator mode.
    -   **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html), extract, and add the `bin` folder to your System PATH.
    -   **Mac**: `brew install ffmpeg`
    -   **Linux**: `sudo apt install ffmpeg`

## How to Run

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Start in Development Mode**
    ```bash
    npm run dev
    ```
    This will launch the application window.

3.  **Build for Production**
    ```bash
    npm run build
    ```
    The output executable will be in the `dist` or `out` folder depending on your OS.

## API Keys

The application comes with some default API keys configured for demonstration. You can update these in the **Settings** tab within the application.

-   Gemini API Keys
-   Pexels API Key
-   Pixabay API Key
-   Cloudflare Worker Auth
