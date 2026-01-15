const express = require("express");
const ytdl = require('@distube/ytdl-core');
const cors = require("cors");

const app = express();

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

        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;

        // CORS 헤더 설정
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, User-Agent');
        res.header(
            "Content-Disposition",
            `attachment; filename="${videoName}.mp3"`
        );
        res.header("Content-type", "audio/mpeg");

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        ytdl(url, { quality: "highestaudio", format: "mp3" }).pipe(res);
    } catch (error) {
        console.error("Error in /mp3:", error);
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

app.get("/mp4", async (req, res) => {
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

        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;

        // CORS 헤더 설정
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, User-Agent');
        res.header(
            "Content-Disposition",
            `attachment; filename="${videoName}.mp4"`
        );
        res.header("Content-type", "video/mp4");

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        ytdl(url, {
            quality: "highest",
            format: "mp4",
        }).pipe(res);
    } catch (error) {
        console.error("Error in /mp4:", error);
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

app.listen(process.env.PORT || 3500, () => {
    console.log("Server on");
});
