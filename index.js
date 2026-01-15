const express = require("express");
const ytdl = require('@distube/ytdl-core');
const cors = require("cors");

const app = express();

// 요청 크기 제한 증가 (Railway를 위한 설정)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS 설정 - 모든 origin 허용 (프로덕션에서는 특정 도메인으로 제한 권장)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'User-Agent'],
  credentials: false
}));

// OPTIONS 요청 처리 (preflight)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, User-Agent');
  res.sendStatus(200);
});

app.get("/", (req, res) => {
    const ping = new Date();
    ping.setHours(ping.getHours() - 3);
    console.log(
        `Ping at: ${ping.getUTCHours()}:${ping.getUTCMinutes()}:${ping.getUTCSeconds()}`
    );
    res.header('Access-Control-Allow-Origin', '*');
    res.sendStatus(200);
});

app.get("/info", async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        const info = (await ytdl.getInfo(url)).videoDetails;
        const title = info.title;
        const thumbnail = info.thumbnails[2]?.url || info.thumbnails[0]?.url;

        res.header('Access-Control-Allow-Origin', '*');
        res.json({ title: title, thumbnail: thumbnail });
    } catch (error) {
        console.error("Error in /info:", error);
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

app.get("/mp3", async (req, res) => {
    let stream = null;
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        console.log(`[MP3] Request received for URL: ${url}`);

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        console.log(`[MP3] Fetching video info...`);
        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;
        
        // 파일명 안전하게 처리 (특수문자 제거)
        const safeFileName = videoName.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || 'video';

        console.log(`[MP3] Video title: ${videoName}`);
        console.log(`[MP3] Starting download...`);

        // CORS 헤더 설정
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, User-Agent');
        res.header(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(safeFileName)}.mp3"`
        );
        res.header("Content-type", "audio/mpeg");

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        // 스트림 생성 및 에러 핸들링
        stream = ytdl(url, { 
            quality: "highestaudio",
            filter: "audioonly"
        });

        stream.on('error', (error) => {
            console.error(`[MP3] Stream error:`, error);
            if (!res.headersSent) {
                res.header('Access-Control-Allow-Origin', '*');
                res.status(500).json({ error: error.message || "Stream error occurred" });
            }
        });

        stream.on('end', () => {
            console.log(`[MP3] Download completed`);
        });

        stream.pipe(res);

    } catch (error) {
        console.error("[MP3] Error:", error);
        if (!res.headersSent) {
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: error.message || "Internal server error" });
        }
        // 스트림이 생성되었다면 정리
        if (stream) {
            stream.destroy();
        }
    }
});

app.get("/mp4", async (req, res) => {
    let stream = null;
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        console.log(`[MP4] Request received for URL: ${url}`);

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        console.log(`[MP4] Fetching video info...`);
        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;
        
        // 파일명 안전하게 처리 (특수문자 제거)
        const safeFileName = videoName.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || 'video';

        console.log(`[MP4] Video title: ${videoName}`);
        console.log(`[MP4] Starting download...`);

        // CORS 헤더 설정
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, User-Agent');
        res.header(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(safeFileName)}.mp4"`
        );
        res.header("Content-type", "video/mp4");

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        // 스트림 생성 및 에러 핸들링
        stream = ytdl(url, {
            quality: "highest"
        });

        stream.on('error', (error) => {
            console.error(`[MP4] Stream error:`, error);
            if (!res.headersSent) {
                res.header('Access-Control-Allow-Origin', '*');
                res.status(500).json({ error: error.message || "Stream error occurred" });
            }
        });

        stream.on('end', () => {
            console.log(`[MP4] Download completed`);
        });

        stream.pipe(res);

    } catch (error) {
        console.error("[MP4] Error:", error);
        if (!res.headersSent) {
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: error.message || "Internal server error" });
        }
        // 스트림이 생성되었다면 정리
        if (stream) {
            stream.destroy();
        }
    }
});

const server = app.listen(process.env.PORT || 3500, () => {
    console.log(`Server on port ${process.env.PORT || 3500}`);
});

// Railway를 위한 타임아웃 설정 (30분)
server.timeout = 1800000;
server.keepAliveTimeout = 1800000;
server.headersTimeout = 1800000;
